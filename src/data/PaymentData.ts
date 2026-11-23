import ConnectToDatabase from "./Connexion"
import { AppError } from "../services/Authentication"


type ActiveOrderRaw = {
    id: string
    total: string | number
}

type LocalPayment = {
    id: string
    mercado_pago_id: string | null
    status: string
}

export type PendingPaymentDetails = {
    id: string
    mercado_pago_id: string | null
    created_at: Date | string
    expires_at: Date | string
}

export type ExpiredPaymentCandidate = {
    id: string
    client_id: string
    mercado_pago_id: string
    expires_at: Date | string
}

type OrderToFinalize = {
    id: string
    productid: string
    provider: string
    quantity: number
    state: string
}

type TerminalPaymentStatus = 'EXPIRED' | 'CANCELLED'


export default class PaymentData extends ConnectToDatabase {
    protected ORDER_TABLE = 'orders'
    protected PAYMENTS_TABLE = 'payments'
    protected PAYMENT_ORDERS_TABLE = 'payment_orders'
    protected PRODUCT_TABLE = 'products'


    public hasPendingPaymentForClient = async(clientId: string): Promise<boolean> => {
        const payment = await ConnectToDatabase.con(this.PAYMENTS_TABLE)
            .select('id')
            .where({
                client_id: clientId,
                status: 'PENDING'
            })
            .first()

        return Boolean(payment)
    }

    public createPendingPayment = async(
        clientId: string,
        paymentId: string,
        method: string
    ): Promise<{ amount: number, orderIds: string[] }> => {
        const createdAt = new Date()
        const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000)
        const paymentOrdersTable = this.PAYMENT_ORDERS_TABLE
        const paymentsTable = this.PAYMENTS_TABLE

        return ConnectToDatabase.con.transaction(async(trx) => {
            const orders: ActiveOrderRaw[] = await trx(this.ORDER_TABLE)
                .select('id', 'total')
                .where({
                    client: clientId,
                    state: 'REQUESTED'
                })
                .whereNotExists(function(){
                    this.select(1)
                        .from(`${paymentOrdersTable} as payment_orders`)
                        .join(
                            `${paymentsTable} as payments`,
                            'payments.id',
                            'payment_orders.payment_id'
                        )
                        .whereRaw('payment_orders.order_id = orders.id')
                        .andWhere('payments.client_id', clientId)
                        .andWhere('payments.status', 'APPROVED')
                })
                .forUpdate()

            if(orders.length === 0){
                throw new AppError(400, 'Não há pedidos ativos para pagar')
            }

            const orderIds = orders.map(order => order.id)
            const existingPayment = await trx({
                paymentOrder: this.PAYMENT_ORDERS_TABLE
            })
                .join(
                    { payment: this.PAYMENTS_TABLE },
                    'payment.id',
                    'paymentOrder.payment_id'
                )
                .whereIn('paymentOrder.order_id', orderIds)
                .andWhere(function(){
                    this.where('payment.status', 'PENDING')
                        .orWhere('payment.status', 'APPROVED')
                })
                .andWhere('payment.client_id', clientId)
                .first('payment.id')

            if(existingPayment){
                throw new AppError(409, 'Já existe um pagamento pendente para estes pedidos')
            }

            const amountInCents = orders.reduce((sum, order) => {
                const total = Number(order.total)

                if(!Number.isFinite(total) || total <= 0){
                    throw new AppError(400, 'Um pedido possui um valor inválido')
                }

                return sum + Math.round(total * 100)
            }, 0)

            if(amountInCents <= 0){
                throw new AppError(400, 'O valor total dos pedidos é inválido')
            }

            await trx(this.PAYMENTS_TABLE).insert({
                id: paymentId,
                client_id: clientId,
                external_reference: paymentId,
                amount: (amountInCents / 100).toFixed(2),
                method,
                status: 'PENDING',
                created_at: createdAt,
                expires_at: expiresAt
            })

            await trx(this.PAYMENT_ORDERS_TABLE).insert(
                orderIds.map(orderId => ({
                    payment_id: paymentId,
                    order_id: orderId
                }))
            )

            return {
                amount: amountInCents / 100,
                orderIds
            }
        })
    }

    public saveGatewayResult = async(
        internalPaymentId: string,
        mercadoPagoId: string,
        gatewayStatus: string,
        gatewayApprovedAt?: string | Date | null
    ): Promise<void> => {
        if(!internalPaymentId || !mercadoPagoId || !gatewayStatus){
            throw new AppError(400, 'Os dados do resultado do pagamento são obrigatórios')
        }

        const normalizedStatus = gatewayStatus.toLowerCase()
        const pendingStatuses = [
            'pending',
            'in_process',
            'authorized',
            'in_mediation',
            'cancelled'
        ]
        const status =
            normalizedStatus === 'approved' ? 'APPROVED' :
            normalizedStatus === 'rejected' ? 'REJECTED' :
            pendingStatuses.includes(normalizedStatus) ? 'PENDING' :
            undefined

        if(!status){
            throw new AppError(502, `O serviço de pagamento retornou um status não suportado: ${gatewayStatus}`)
        }

        const approvedAt = status !== 'APPROVED'
            ? undefined
            : gatewayApprovedAt instanceof Date
            ? gatewayApprovedAt
            : gatewayApprovedAt
            ? new Date(gatewayApprovedAt)
            : new Date()

        if(approvedAt && Number.isNaN(approvedAt.getTime())){
            throw new AppError(400, 'A data de aprovação do pagamento é inválida')
        }

        const terminalStatuses = ['APPROVED', 'EXPIRED', 'CANCELLED', 'REJECTED']
        const updatedRows = await ConnectToDatabase.con(this.PAYMENTS_TABLE)
            .where({ id: internalPaymentId })
            .whereNotIn('status', terminalStatuses)
            .update({
                mercado_pago_id: mercadoPagoId,
                status,
                ...(approvedAt ? { approved_at: approvedAt } : {})
            })
            .returning('id')

        if(updatedRows.length !== 1){
            const payment = await ConnectToDatabase.con(this.PAYMENTS_TABLE)
                .select('status')
                .where({ id: internalPaymentId })
                .first()

            if(terminalStatuses.includes(payment?.status ?? '')) return

            throw new AppError(404, 'Registro local do pagamento não encontrado')
        }
    }

    public markPaymentRejected = async(internalPaymentId: string): Promise<void> => {
        const updatedRows = await ConnectToDatabase.con(this.PAYMENTS_TABLE)
            .where({
                id: internalPaymentId,
                status: 'PENDING'
            })
            .update({ status: 'REJECTED' })
            .returning('id')

        if(updatedRows.length !== 1){
            throw new AppError(500, 'Não foi possível registrar o pagamento como recusado')
        }
    }

    public findPaymentForClient = async(
        internalPaymentId: string,
        clientId: string
    ): Promise<LocalPayment | undefined> => {
        const [payment]: LocalPayment[] = await ConnectToDatabase.con(this.PAYMENTS_TABLE)
            .select('id', 'mercado_pago_id', 'status')
            .where({
                id: internalPaymentId,
                client_id: clientId
            })

        return payment
    }

    public hasApprovedPaymentForOrder = async(orderId: string): Promise<boolean> => {
        const payment = await ConnectToDatabase.con(this.PAYMENT_ORDERS_TABLE)
            .join(
                this.PAYMENTS_TABLE,
                `${this.PAYMENTS_TABLE}.id`,
                `${this.PAYMENT_ORDERS_TABLE}.payment_id`
            )
            .where(`${this.PAYMENT_ORDERS_TABLE}.order_id`, orderId)
            .andWhere(`${this.PAYMENTS_TABLE}.status`, 'APPROVED')
            .first(`${this.PAYMENTS_TABLE}.id`)

        return Boolean(payment)
    }

    public findPendingPaymentForClient = async(
        clientId: string
    ): Promise<PendingPaymentDetails | undefined> => {
        return ConnectToDatabase.con(this.PAYMENTS_TABLE)
            .select('id', 'mercado_pago_id', 'created_at', 'expires_at')
            .where({
                client_id: clientId,
                status: 'PENDING'
            })
            .orderBy('created_at', 'desc')
            .first()
    }

    public findPaymentOrderStates = async(internalPaymentId: string): Promise<string[]> => {
        const orders: Array<{ state: string }> = await ConnectToDatabase.con(this.ORDER_TABLE)
            .join(
                this.PAYMENT_ORDERS_TABLE,
                `${this.PAYMENT_ORDERS_TABLE}.order_id`,
                `${this.ORDER_TABLE}.id`
            )
            .select(`${this.ORDER_TABLE}.state`)
            .where(`${this.PAYMENT_ORDERS_TABLE}.payment_id`, internalPaymentId)

        return orders.map(order => order.state)
    }

    public findExpiredPendingPayments = async(): Promise<ExpiredPaymentCandidate[]> => {
        try{
            return await ConnectToDatabase.con(this.PAYMENTS_TABLE)
                .select('id', 'client_id', 'mercado_pago_id', 'expires_at')
                .where('status', 'PENDING')
                .andWhere('expires_at', '<=', new Date())
                .whereNotNull('mercado_pago_id')
                .orderBy('expires_at', 'asc')
                .limit(10)
        }catch(error: any){
            throw new Error(`Erro ao localizar pagamentos vencidos: ${error.message || error}`)
        }
    }

    private finalizePendingPaymentAndRestoreStock = async(
        internalPaymentId: string,
        terminalStatus: TerminalPaymentStatus,
        requireExpiration: boolean
    ): Promise<boolean> => {
        const now = new Date()

        return ConnectToDatabase.con.transaction(async(trx) => {
            const paymentQuery = trx(this.PAYMENTS_TABLE)
                .select('id', 'mercado_pago_id')
                .where({
                    id: internalPaymentId,
                    status: 'PENDING'
                })

            if(requireExpiration){
                paymentQuery.andWhere('expires_at', '<=', now)
            }

            const [payment] = await paymentQuery.forUpdate()
            if(!payment || !payment.mercado_pago_id) return false

            const orders: OrderToFinalize[] = await trx(this.ORDER_TABLE)
                .join(
                    this.PAYMENT_ORDERS_TABLE,
                    `${this.PAYMENT_ORDERS_TABLE}.order_id`,
                    `${this.ORDER_TABLE}.id`
                )
                .select(
                    `${this.ORDER_TABLE}.id`,
                    `${this.ORDER_TABLE}.productid`,
                    `${this.ORDER_TABLE}.provider`,
                    `${this.ORDER_TABLE}.quantity`,
                    `${this.ORDER_TABLE}.state`
                )
                .where(`${this.PAYMENT_ORDERS_TABLE}.payment_id`, internalPaymentId)
                .forUpdate()

            if(orders.length === 0){
                throw new AppError(409, 'O pagamento não possui pedidos associados')
            }

            if(
                terminalStatus === 'CANCELLED' &&
                orders.some(order => order.state !== 'REQUESTED')
            ){
                throw new AppError(
                    409,
                    'Todos os pedidos associados precisam continuar solicitados para cancelar o pagamento'
                )
            }

            const paymentUpdateQuery = trx(this.PAYMENTS_TABLE)
                .where({
                    id: internalPaymentId,
                    status: 'PENDING'
                })

            if(requireExpiration){
                paymentUpdateQuery.andWhere('expires_at', '<=', now)
            }

            const updatedPayments = await paymentUpdateQuery
                .update({ status: terminalStatus })
                .returning('id')

            if(updatedPayments.length !== 1) return false

            for(const order of orders){
                if(order.state !== 'REQUESTED') continue

                const expiredOrders = await trx(this.ORDER_TABLE)
                    .where({
                        id: order.id,
                        state: 'REQUESTED'
                    })
                    .update({ state: 'EXPIRED' })
                    .returning('id')

                if(expiredOrders.length !== 1){
                    if(terminalStatus === 'CANCELLED'){
                        throw new AppError(
                            409,
                            'Um pedido associado foi alterado durante o cancelamento'
                        )
                    }
                    continue
                }

                if(!order.productid){
                    throw new AppError(
                        409,
                        `O pedido ${order.id} não possui produto associado para restaurar o estoque`
                    )
                }

                const restoredProducts = await trx(this.PRODUCT_TABLE)
                    .where({
                        id: order.productid,
                        provider: order.provider
                    })
                    .increment('stock', order.quantity)
                    .returning('id')

                if(restoredProducts.length !== 1){
                    throw new Error(`Não foi possível restaurar o estoque do pedido ${order.id}`)
                }
            }

            return true
        })
    }

    public expirePaymentAndRestoreStock = async(internalPaymentId: string): Promise<boolean> => {
        return this.finalizePendingPaymentAndRestoreStock(
            internalPaymentId,
            'EXPIRED',
            true
        )
    }

    public cancelPendingPaymentRestoreStock = async(
        internalPaymentId: string
    ): Promise<boolean> => {
        return this.finalizePendingPaymentAndRestoreStock(
            internalPaymentId,
            'CANCELLED',
            false
        )
    }

    public expireRejectedPaymentAndRestoreStock = async(
        internalPaymentId: string
    ): Promise<void> => {
        await ConnectToDatabase.con.transaction(async(trx) => {
            const [payment] = await trx(this.PAYMENTS_TABLE)
                .select('id')
                .where({
                    id: internalPaymentId,
                    status: 'REJECTED'
                })
                .forUpdate()

            if(!payment){
                throw new AppError(409, 'Pagamento recusado não encontrado')
            }

            const orders: OrderToFinalize[] = await trx(this.ORDER_TABLE)
                .join(
                    this.PAYMENT_ORDERS_TABLE,
                    `${this.PAYMENT_ORDERS_TABLE}.order_id`,
                    `${this.ORDER_TABLE}.id`
                )
                .select(
                    `${this.ORDER_TABLE}.id`,
                    `${this.ORDER_TABLE}.productid`,
                    `${this.ORDER_TABLE}.provider`,
                    `${this.ORDER_TABLE}.quantity`,
                    `${this.ORDER_TABLE}.state`
                )
                .where(`${this.PAYMENT_ORDERS_TABLE}.payment_id`, internalPaymentId)
                .forUpdate()

            if(orders.length === 0){
                throw new AppError(409, 'O pagamento não possui pedidos associados')
            }

            if(orders.some(order => order.state !== 'REQUESTED' && order.state !== 'EXPIRED')){
                throw new AppError(
                    409,
                    'Um pedido associado não pode ser expirado automaticamente'
                )
            }

            for(const order of orders){
                if(order.state === 'EXPIRED') continue

                const expiredOrders = await trx(this.ORDER_TABLE)
                    .where({
                        id: order.id,
                        state: 'REQUESTED'
                    })
                    .update({ state: 'EXPIRED' })
                    .returning('id')

                if(expiredOrders.length !== 1){
                    throw new AppError(
                        409,
                        'Um pedido associado foi alterado durante o processamento da recusa'
                    )
                }

                if(!order.productid){
                    throw new AppError(
                        409,
                        `O pedido ${order.id} não possui produto associado para restaurar o estoque`
                    )
                }

                const restoredProducts = await trx(this.PRODUCT_TABLE)
                    .where({
                        id: order.productid,
                        provider: order.provider
                    })
                    .increment('stock', order.quantity)
                    .returning('id')

                if(restoredProducts.length !== 1){
                    throw new Error(`Não foi possível restaurar o estoque do pedido ${order.id}`)
                }
            }
        })
    }
}
