import Order from "../model/Order"
import OrderData from "../data/OrderData"
import Services, { AppError } from "../services/Authentication"
//import moment from "moment-timezone"
import ProviderNotificationData from "../data/ProviderNotificationData"
import { OrderModel, UserModel, OrdersByMonthModel } from "../model/typesAndInterfaces"
import axios from "axios"
import { config } from "dotenv"
import { randomUUID as uuidv4 } from "crypto"
import StockConflictError from "../errors/StockConflictError"
import PaymentData from "../data/PaymentData"
import { AuthenticatedActor } from "../services/Authentication"


config()



export interface CreateOrderDTO{
    product: string
    price: number
    quantity: number
    momentString: string
    photoUrl: string
    description: string
    providerId: string
    productId:string

}

export interface PaymentDTO {
    paymentMethodId: string
    token?: string
    issuerId?: string
    payerEmail?: string
    installments?: number
    payerIdentification?: {
        type: string
        number: string
    }
}

export interface PendingPaymentResponse {
    orderId: string
    status: string
    createdAt: string
    qrCode: string | null
    qrCodeBase64: string | null
    qrCodeLink: string | null
}



export default class OrderBusiness{
    constructor(
        private orderData:OrderData,
        private services:Services,
        private paymentData:PaymentData
    ){}

    public createOrder = async(user:UserModel, orderDataDTO:CreateOrderDTO):Promise<void>=>{
        const { quantity, providerId, productId } = orderDataDTO

        if (!providerId || !productId || !quantity) {
            throw new AppError(400, "Campos obrigatórios do pedido ausentes")
        }

        if(!Number.isInteger(quantity) || quantity <= 0){
            throw new AppError(400, 'A quantidade deve ser um número inteiro maior que zero')
        }

        if(await this.paymentData.hasPendingPaymentForClient(user.id)){
            throw new AppError(
                409,
                'Você já possui um pagamento pendente. Conclua ou cancele esse pagamento antes de fazer outro pedido.'
            )
        }

        const dbProduct = await this.orderData.findProductByIdAndProvider(productId, providerId)
        if(!dbProduct){
            throw new AppError(404, 'Produto não encontrado para este fornecedor')
        }

        const product = dbProduct.name || dbProduct.product || orderDataDTO.product
        const price = Number(dbProduct.price)
        const description = dbProduct.description || orderDataDTO.description || ''
        const photoUrl = dbProduct.photoUrl || dbProduct.photo_url || orderDataDTO.photoUrl || ''
        if(!Number.isFinite(price) || price <= 0){
            throw new AppError(409, 'O produto possui um preço inválido')
        }

        const address = `${user.street} ${user.number}, ${user.neighbourhood} ${user.city} - ${user.state}`
        const id = this.services.idGenerator()
        const existingOrder = await this.orderData.findRequestedOrder(product, price, description, user.id)
        if(existingOrder){
            throw new AppError(403, `Você já possui um pedido ativo de '${product}'. Deseja consultá-lo?`)
        }

        const order = new Order(
            id, 
            product, 
            price, 
            photoUrl, 
            quantity,
            Number((quantity * price).toFixed(2)),
            new Date(),
            user.id,
            'REQUESTED',
            address,
            description,
            providerId,
            productId
        )

        try{
            await this.orderData.createOrder(order, productId, providerId, quantity)
        }catch(e){
            if(e instanceof StockConflictError){
                throw new AppError(409, e.message)
            }
            throw e
        }

        try{
            await new ProviderNotificationData().saveProviderNofitication(
                `Novo pedido de ${product}`,
                providerId
            )
        }catch(e:unknown){
            console.error(
                `Pedido ${id} foi criado, mas a notificação ao fornecedor ${providerId} falhou: ${e}`
            )
        }
    }
    

    private verifyOrderAccess = (order:OrderModel, actor:AuthenticatedActor):void=>{
        const isOwnerUser = actor.role === 'USER' && order.client === actor.id
        const isOwnerRestaurant = actor.role === 'RESTAURANT' && order.provider === actor.id

        if(!isOwnerUser && !isOwnerRestaurant){
            throw new AppError(403, 'Você não tem permissão para acessar ou alterar este pedido')
        }
    }


    public getOrderById = async(
        orderId:string,
        actor:AuthenticatedActor
    ):Promise<OrderModel>=>{
        const order = await this.orderData.findOrderById(orderId)
        if(!order){
            throw new AppError(404, 'Pedido não encontrado')
        }

        this.verifyOrderAccess(order, actor)
       
        return order
    }

   
    public deleteOrder = async(
        orderId:string,
        actor:AuthenticatedActor
    ):Promise<void>=>{
        const order = await this.orderData.findOrderById(orderId)
        if(!order){
            throw new AppError(404, 'Pedido não encontrado')
        }

        this.verifyOrderAccess(order, actor)

        if(actor.role === 'RESTAURANT' && order.state === 'REQUESTED'){
            throw new AppError(403, 'O fornecedor não pode excluir pedidos solicitados')
        }

        if(
            actor.role === 'RESTAURANT' &&
            (order.state === 'EXPIRED' || order.state === 'FINISHED')
        ){
            await this.orderData.archiveOrder(order.id, actor.id)
            return
        }

        await this.orderData.deleteOrder(order);
    }


    public clearOrderHistory = async (userId: string): Promise<void> => {
        const finishedOrders = await this.orderData.findFinishedOrdersByClient(userId);
        if (finishedOrders.length === 0) {
            throw new AppError(404, "Seu histórico de pedidos já está vazio");
        }
        await this.orderData.deleteFinishedOrdersByClient(userId);
    }


    // public clearRequestedOrders = async (userId: string, orderId: string): Promise<void> => {
    //     await this.orderData.deleteRequestedOrdersByProvider(userId, orderId);
    // }


    public updateOrderQuantity = async(
        orderId:string,
        quantity:number,
        userId:string
    ):Promise<void>=>{
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new AppError(400, "A quantidade deve ser um número inteiro maior que zero");
        }

        const order = await this.orderData.findOrderById(orderId)
        if(!order){
            throw new AppError(404, 'Pedido não encontrado')
        }

        if(order.client !== userId){
            throw new AppError(403, 'Você não tem permissão para alterar este pedido')
        }

        await this.orderData.updateOrderQuantity(quantity, orderId)
    }


    public markOrderAsFinished = async(
        orderId:string,
        providerId:string
    ):Promise<void>=>{
        const order = await this.orderData.findOrderById(orderId)
        if(!order){
            throw new AppError(404, 'Pedido não encontrado')
        }

        if(order.provider !== providerId){
            throw new AppError(403, 'Você não tem permissão para alterar este pedido')
        }

        if(order.state !== 'REQUESTED'){
            throw new AppError(409, 'Somente pedidos solicitados podem ser finalizados')
        }

        if(!await this.paymentData.hasApprovedPaymentForOrder(orderId)){
            throw new AppError(409, 'Somente pedidos pagos podem ser finalizados')
        }

        await this.orderData.updateOrderStatusToFinished(orderId, providerId)
    }


    public revertOrderToRequested = async(
        orderId:string,
        providerId:string
    ):Promise<void>=>{
        const order = await this.orderData.findOrderById(orderId)
        if(!order){
            throw new AppError(404, 'Pedido não encontrado')
        }
        if(order.provider !== providerId){
            throw new AppError(403, 'Você não tem permissão para alterar este pedido')
        }
        if(order.state !== 'FINISHED'){
            throw new AppError(409, 'Somente pedidos finalizados podem voltar para solicitado')
        }
        await this.orderData.updateOrderStatusToRequested(orderId, providerId)
    }


    /* private removeExpiredOrders = async(orders:OrderModel[]):Promise<void>=>{
        const startOfToday = moment().tz('America/Sao_Paulo').startOf('day')

        for(const order of orders){
            const orderDate = moment.tz(
                order.moment,
                'DD/MM/YYYY [at] HH:mm',
                'America/Sao_Paulo'
            ).startOf('day')

            if(orderDate.isBefore(startOfToday)){
                await this.orderData.deleteOrder(order.id)
            }
        }
    } */

    
    public getActiveOrders = async(userId:string):Promise<OrderModel[]>=>{
        const orders = await this.orderData.findActiveOrdersByClient(userId)
        if(orders.length === 0){
            throw new AppError(404, "Você ainda não fez nenhum pedido ativo")
        }
        //await this.removeExpiredOrders(orders)
        return orders
    }


    public getAllOrders = async(providerId:string):Promise<OrderModel[]>=>{
        const orders = await this.orderData.findVisibleOrdersByProvider(providerId)
        //await this.removeExpiredOrders(orders)
        
        if(orders.length === 0){
            throw new AppError(404, 'Lista de pedidos está vazia')
        } 

        return orders
    }


    public getArchivedOrders = async(providerId:string):Promise<OrderModel[]>=>{
        return this.orderData.findArchiveOrdersByProvider(providerId)
    }


    public getPaidOrders = async(userId:string):Promise<OrderModel[]>=>{
        const orders = await this.orderData.findPaidOrdersByClient(userId)
        if(orders.length === 0){
            throw new AppError(404, 'Nenhum pedido pago encontrado')
        }
        return orders
    }


    public getRecentOrders = async(providerId:string):Promise<OrderModel[]>=>{
        const recentOrders = await this.orderData.findRecentOrders(providerId)
        //await this.removeExpiredOrders(orders)
        
        if(recentOrders.length === 0){
            throw new AppError(404, 'Lista de pedidos recentes está vazia')
        } 

        return recentOrders
    }


    public ordersByMonth = async(providerId:string):Promise<OrdersByMonthModel[]>=>{
        const findOrdersByMonth = await this.orderData.findOrdersByMonth(providerId)
        //await this.removeExpiredOrders(orders)
        
        if(findOrdersByMonth.length === 0){
            throw new AppError(404, 'Lista de pedidos por mês está vazia')
        } 

        return findOrdersByMonth
    }


    public getActiveOrdersByUserId = async(userId:string, providerId:string):Promise<OrderModel[]>=>{
        const orders = await this.orderData.findAllOrdersByClient(userId, providerId)
        if(orders.length === 0){
            throw new AppError(404, 'Nenhum pedido ativo encontrado para este usuário')
        }
        return orders
    }


    public getFinishedOrders = async(userId:string):Promise<OrderModel[]>=>{
        const orders = await this.orderData.findFinishedOrdersByClient(userId)
        if(orders.length === 0){
            throw new AppError(404, 'Nenhum pedido finalizado encontrado em seu histórico')
        }
        //await this.removeExpiredOrders(orders)
        return orders
    } 
    
    
    public processPayment = async(
        paymentDTO:PaymentDTO,
        user:UserModel
    ):Promise<any>=>{
        let internalPaymentId:string | undefined
        let localPaymentCreated = false

        try{
            const paymentMethodId = paymentDTO.paymentMethodId?.trim()
            if(!paymentMethodId){
                throw new AppError(400, 'A forma de pagamento é obrigatória')
            }

            const isPix = paymentMethodId === 'pix'
            let cardData: {
                token: string
                issuerId: string
                installments: number
                payerEmail: string
                payerIdentification: { type: string, number: string }
            } | undefined

            if(!isPix){
                const token = paymentDTO.token?.trim()
                const issuerId = paymentDTO.issuerId?.trim()
                const installments = paymentDTO.installments
                const payerEmail = paymentDTO.payerEmail?.trim()
                const identificationType = paymentDTO.payerIdentification?.type?.trim()
                const identificationNumber = paymentDTO.payerIdentification?.number?.trim()

                if(
                    !token ||
                    !issuerId ||
                    typeof installments !== 'number' ||
                    !Number.isInteger(installments) ||
                    installments < 1 ||
                    !payerEmail ||
                    !identificationType ||
                    !identificationNumber
                ){
                    throw new AppError(400, 'Os dados do pagamento com cartão estão incompletos')
                }

                cardData = {
                    token,
                    issuerId,
                    installments,
                    payerEmail,
                    payerIdentification: {
                        type: identificationType,
                        number: identificationNumber
                    }
                }
            }

            const accessToken = process.env.ACCESS_TOKEN?.trim()
            if(!accessToken){
                throw new AppError(500, 'O serviço de pagamento não está configurado')
            }

            internalPaymentId = uuidv4()
            const { amount } = await this.paymentData.createPendingPayment(
                user.id,
                internalPaymentId,
                paymentMethodId
            )
            localPaymentCreated = true

            const payload = isPix
                ? {
                    transaction_amount: amount,
                    description: 'Pedido Meu Delivery',
                    payment_method_id: paymentMethodId,
                    payer: {
                        email: user.email,
                        first_name: user.username || 'Cliente',
                        last_name: 'Meu Delivery'
                    },
                    external_reference: internalPaymentId
                }
                : {
                    transaction_amount: amount,
                    description: 'Pedido Meu Delivery',
                    token: cardData?.token,
                    installments: cardData?.installments,
                    payment_method_id: paymentMethodId,
                    issuer_id: cardData?.issuerId,
                    payer: {
                        email: cardData?.payerEmail,
                        first_name: user.username || 'Cliente',
                        last_name: 'Meu Delivery',
                        identification: cardData?.payerIdentification
                    },
                    external_reference: internalPaymentId
                }

            const response = await axios.post(
                'https://api.mercadopago.com/v1/payments',
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'X-Idempotency-Key': internalPaymentId
                    }
                }
            )

            if(!response.data?.id || !response.data?.status){
                throw new AppError(502, 'O serviço de pagamento retornou uma resposta incompleta')
            }

            await this.paymentData.saveGatewayResult(
                internalPaymentId,
                String(response.data.id),
                String(response.data.status),
                response.data.date_approved
            )

            if(String(response.data.status).toLowerCase() === 'rejected'){
                await this.paymentData.expireRejectedPaymentAndRestoreStock(internalPaymentId)
            }

            return response.data
        }catch(error:unknown){
            if(error instanceof AppError){
                throw error
            }

            if(axios.isAxiosError(error)){
                const responseStatus = error.response?.status

                if(
                    localPaymentCreated &&
                    internalPaymentId &&
                    responseStatus !== undefined &&
                    responseStatus >= 400 &&
                    responseStatus < 500
                ){
                    await this.paymentData.markPaymentRejected(internalPaymentId)
                    await this.paymentData.expireRejectedPaymentAndRestoreStock(internalPaymentId)
                }

                throw new AppError(
                    responseStatus || 502,
                    error.response?.data?.message || 'Falha ao processar o pagamento'
                )
            }

            throw new AppError(
                500,
                error instanceof Error ? error.message : 'Erro inesperado ao processar pagamento'
            )
        }
    }


    public getPaymentStatus = async(
        internalPaymentId:string,
        user:UserModel
    ):Promise<string>=>{
        try{
            if(!internalPaymentId){
                throw new AppError(400, 'O identificador do pagamento é obrigatório')
            }

            const payment = await this.paymentData.findPaymentForClient(
                internalPaymentId,
                user.id
            )
            if(!payment){
                throw new AppError(404, 'Pagamento não encontrado')
            }
            if(!payment.mercado_pago_id){
                throw new AppError(409, 'O pagamento ainda está sendo registrado')
            }

            const accessToken = process.env.ACCESS_TOKEN?.trim()
            if(!accessToken){
                throw new AppError(500, 'O serviço de pagamento não está configurado')
            }

            const response = await axios.get(
                `https://api.mercadopago.com/v1/payments/${payment.mercado_pago_id}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            )

            if(
                String(response.data.id) !== payment.mercado_pago_id ||
                response.data.external_reference !== payment.id
            ){
                throw new AppError(403, 'O pagamento não corresponde ao registro local')
            }

            const status = String(response.data.status)
            await this.paymentData.saveGatewayResult(
                payment.id,
                payment.mercado_pago_id,
                status,
                response.data.date_approved
            )

            if(status.toLowerCase() === 'rejected'){
                await this.paymentData.expireRejectedPaymentAndRestoreStock(payment.id)
            }else if(status.toLowerCase() === 'cancelled' && payment.status === 'PENDING'){
                const finalized = await this.paymentData.cancelPendingPaymentRestoreStock(payment.id)
                if(!finalized){
                    throw new AppError(409, 'Não foi possível concluir o cancelamento do pagamento')
                }
            }

            return status
        }catch(error:unknown){
            if(error instanceof AppError) throw error

            if(axios.isAxiosError(error)){
                throw new AppError(
                    error.response?.status || 502,
                    error.response?.data?.message || 'Não foi possível consultar o status do pagamento'
                )
            }

            throw new AppError(
                500,
                error instanceof Error ? error.message : 'Erro inesperado ao consultar pagamento'
            )
        }
    }


    public getPendingPayment = async(user:UserModel):Promise<PendingPaymentResponse>=>{
        try{
            const payment = await this.paymentData.findPendingPaymentForClient(user.id)
            if(!payment){
                throw new AppError(404, 'Nenhum pagamento pendente encontrado')
            }
            if(!payment.mercado_pago_id){
                throw new AppError(409, 'O pagamento ainda está sendo registrado')
            }

            const accessToken = process.env.ACCESS_TOKEN?.trim()
            if(!accessToken){
                throw new AppError(500, 'O serviço de pagamento não está configurado')
            }

            const response = await axios.get(
                `https://api.mercadopago.com/v1/payments/${payment.mercado_pago_id}`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: 5000
                }
            )

            if(
                String(response.data?.id) !== payment.mercado_pago_id ||
                response.data?.external_reference !== payment.id
            ){
                throw new AppError(502, 'O serviço de pagamento retornou um pagamento incompatível')
            }

            const status = String(response.data?.status || '').toLowerCase()
            if(!status){
                throw new AppError(502, 'O serviço de pagamento retornou um status vazio')
            }

            await this.paymentData.saveGatewayResult(
                payment.id,
                payment.mercado_pago_id,
                status,
                response.data.date_approved
            )

            if(status === 'rejected'){
                await this.paymentData.expireRejectedPaymentAndRestoreStock(payment.id)
            }else if(status === 'cancelled'){
                const finalized = await this.paymentData.cancelPendingPaymentRestoreStock(payment.id)
                if(!finalized){
                    throw new AppError(409, 'Não foi possível concluir o cancelamento do pagamento')
                }
            }

            const transactionData =
                response.data?.point_of_interaction?.transaction_data

            return {
                orderId: payment.id,
                status,
                createdAt: new Date(payment.created_at).toISOString(),
                qrCode: transactionData?.qr_code || null,
                qrCodeBase64: transactionData?.qr_code_base64 || null,
                qrCodeLink:
                    transactionData?.ticket_url ||
                    transactionData?.qr_code_link ||
                    null
            }
        }catch(error:unknown){
            if(error instanceof AppError) throw error

            if(axios.isAxiosError(error)){
                throw new AppError(
                    error.response?.status || 502,
                    error.response?.data?.message || 'Não foi possível recuperar o pagamento pendente'
                )
            }

            throw new AppError(
                500,
                error instanceof Error ? error.message : 'Erro inesperado ao recuperar pagamento'
            )
        }
    }


    public cancelPayment = async(
        internalPaymentId:string,
        user:UserModel
    ):Promise<void>=>{
        try{
            const paymentId = internalPaymentId?.trim()
            if(!paymentId){
                throw new AppError(400, 'O identificador do pagamento é obrigatório')
            }

            const payment = await this.paymentData.findPaymentForClient(paymentId, user.id)
            if(!payment){
                throw new AppError(404, 'Pagamento não encontrado')
            }
            if(payment.status !== 'PENDING'){
                throw new AppError(409, 'Somente pagamentos pendentes podem ser cancelados')
            }
            if(!payment.mercado_pago_id){
                throw new AppError(409, 'O pagamento ainda está sendo registrado')
            }

            const orderStates = await this.paymentData.findPaymentOrderStates(payment.id)
            if(orderStates.length === 0 || orderStates.some(state => state !== 'REQUESTED')){
                throw new AppError(
                    409,
                    'O pagamento não pode ser cancelado porque um pedido associado já foi alterado'
                )
            }

            const accessToken = process.env.ACCESS_TOKEN?.trim()
            if(!accessToken){
                throw new AppError(500, 'O serviço de pagamento não está configurado')
            }

            const paymentUrl =
                `https://api.mercadopago.com/v1/payments/${payment.mercado_pago_id}`
            const requestConfig = {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 5000
            }
            const paymentResponse = await axios.get(paymentUrl, requestConfig)

            if(
                String(paymentResponse.data?.id) !== payment.mercado_pago_id ||
                paymentResponse.data?.external_reference !== payment.id
            ){
                throw new AppError(502, 'O serviço de pagamento retornou um pagamento incompatível')
            }

            let gatewayStatus = String(paymentResponse.data?.status || '').toLowerCase()
            if(gatewayStatus === 'approved'){
                await this.paymentData.saveGatewayResult(
                    payment.id,
                    payment.mercado_pago_id,
                    gatewayStatus,
                    paymentResponse.data.date_approved
                )
                throw new AppError(409, 'Um pagamento aprovado não pode ser cancelado')
            }

            if(gatewayStatus === 'pending'){
                const cancellationResponse = await axios.put(
                    paymentUrl,
                    { status: 'cancelled' },
                    requestConfig
                )
                if(
                    String(cancellationResponse.data?.id) !== payment.mercado_pago_id ||
                    cancellationResponse.data?.external_reference !== payment.id
                ){
                    throw new AppError(502, 'O serviço de pagamento retornou um cancelamento incompatível')
                }
                gatewayStatus = String(cancellationResponse.data?.status || '').toLowerCase()
            }

            if(gatewayStatus === 'approved'){
                await this.paymentData.saveGatewayResult(
                    payment.id,
                    payment.mercado_pago_id,
                    gatewayStatus
                )
                throw new AppError(409, 'Um pagamento aprovado não pode ser cancelado')
            }

            if(gatewayStatus !== 'cancelled' && gatewayStatus !== 'rejected'){
                throw new AppError(409, 'O serviço de pagamento não confirmou o cancelamento')
            }

            const finalized = await this.paymentData.cancelPendingPaymentRestoreStock(payment.id)
            if(!finalized){
                throw new AppError(409, 'Não foi possível concluir o cancelamento do pagamento')
            }
        }catch(error:unknown){
            if(error instanceof AppError) throw error

            if(axios.isAxiosError(error)){
                throw new AppError(
                    error.response?.status || 502,
                    error.response?.data?.message || 'Não foi possível cancelar o pagamento'
                )
            }

            throw new AppError(
                500,
                error instanceof Error ? error.message : 'Erro inesperado ao cancelar pagamento'
            )
        }
    }


    public reconcileExpiredPendingPayments = async():Promise<{
        checked:number
        approved:number
        stillPending:number
        expired:number
        unchanged:number
    }>=>{
        const accessToken = process.env.ACCESS_TOKEN?.trim()
        if(!accessToken){
            throw new AppError(500, 'O serviço de pagamento não está configurado')
        }

        const payments = await this.paymentData.findExpiredPendingPayments()
        const results = await Promise.allSettled(payments.map(async payment => {
            const paymentUrl =
                `https://api.mercadopago.com/v1/payments/${payment.mercado_pago_id}`
            const requestConfig = {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 5000
            }
            const response = await axios.get(paymentUrl, requestConfig)

            if(
                String(response.data?.id) !== payment.mercado_pago_id ||
                response.data?.external_reference !== payment.id
            ){
                throw new AppError(502, 'O serviço de pagamento retornou um pagamento incompatível')
            }

            let status = String(response.data?.status || '').toLowerCase()
            if(status === 'pending'){
                const cancellationResponse = await axios.put(
                    paymentUrl,
                    { status: 'cancelled' },
                    requestConfig
                )
                if(
                    String(cancellationResponse.data?.id) !== payment.mercado_pago_id ||
                    cancellationResponse.data?.external_reference !== payment.id
                ){
                    throw new AppError(502, 'O serviço de pagamento retornou um cancelamento incompatível')
                }
                status = String(cancellationResponse.data?.status || '').toLowerCase()
            }

            if(status === 'approved'){
                await this.paymentData.saveGatewayResult(
                    payment.id,
                    payment.mercado_pago_id,
                    status,
                    response.data.date_approved
                )
                return 'approved' as const
            }

            if(status === 'rejected'){
                await this.paymentData.saveGatewayResult(
                    payment.id,
                    payment.mercado_pago_id,
                    status
                )
                await this.paymentData.expireRejectedPaymentAndRestoreStock(payment.id)
                return 'expired' as const
            }

            if(status === 'cancelled'){
                const expired = await this.paymentData.expirePaymentAndRestoreStock(payment.id)
                return expired ? 'expired' as const : 'unchanged' as const
            }

            if(
                status === 'pending' ||
                status === 'in_process' ||
                status === 'authorized' ||
                status === 'in_mediation'
            ){
                await this.paymentData.saveGatewayResult(
                    payment.id,
                    payment.mercado_pago_id,
                    status
                )
                return 'stillPending' as const
            }

            console.warn(
                `Pagamento ${payment.id} com status Mercado Pago não tratado: ${status || 'vazio'}`
            )
            return 'unchanged' as const
        }))

        const summary = {
            checked: payments.length,
            approved: 0,
            stillPending: 0,
            expired: 0,
            unchanged: 0
        }
        let failures = 0

        results.forEach((result, index) => {
            if(result.status === 'rejected'){
                failures++
                console.error(
                    `Falha ao reconciliar pagamento ${payments[index].id}:`,
                    result.reason
                )
                return
            }
            summary[result.value]++
        })

        if(failures > 0){
            throw new AppError(502, `Falha ao reconciliar ${failures} pagamento(s) vencido(s)`)
        }
        return summary
    }
}