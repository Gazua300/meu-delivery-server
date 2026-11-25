import ConnectToDatabase from "./Connexion"
import Orders from "../model/Order"
import { OrderModel, OrdersByMonthModel } from "../model/typesAndInterfaces"
import ProviderNotificationData from "./ProviderNotificationData"
import StockConflictError from "../errors/StockConflictError"
import { AppError } from "../services/Authentication"


type DatabaseProduct = {
    name?: string
    product?: string
    price: string | number
    description?: string
    photoUrl?: string
    photo_url?: string
}


export default class OrderData extends ConnectToDatabase{
    protected ORDER_TABLE = 'orders'
    protected USER_TABLE = 'users'
    protected PRODUCT_TABLE = 'products'
    protected PAYMENTS_TABLE = 'payments'
    protected PAYMENT_ORDERS_TABLE = 'payment_orders'

    
    public createOrder = async(order:Orders, productId:string, providerId:string, quantity:number):Promise<void>=>{
        if(!Number.isInteger(quantity) || quantity <= 0){
            throw new AppError(400, 'A quantidade deve ser um número inteiro maior que zero')
        }
        
        try{
            await ConnectToDatabase.con.transaction(async(trx)=>{
                const updatedProducts = await trx(this.PRODUCT_TABLE)
                    .where({
                        id: productId,
                        provider: providerId
                    })
                    .where('stock', '>=', quantity)
                    .decrement('stock', quantity)
                    .returning('id')
                
                if(updatedProducts.length !== 1){
                    throw new StockConflictError()
                }

                await order.save(trx)
            })           
            
        }catch(e:any){
            if(e instanceof StockConflictError){
                throw e
            }
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao criar o pedido: ${message}`)
        }
    }


    public findProductByIdAndProvider = async(
        productId:string,
        providerId:string
    ):Promise<DatabaseProduct | undefined>=>{
        try{
            return await ConnectToDatabase.con(this.PRODUCT_TABLE)
                .where({ id: productId, provider: providerId })
                .first()
        }catch(e:unknown){
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao buscar produto: ${message}`)
        }
    }


    public findRequestedOrder = async(product:string, price:number, description:string, client:string):Promise<OrderModel | undefined>=>{
        try{
            const paymentOrdersTable = this.PAYMENT_ORDERS_TABLE
            const paymentsTable = this.PAYMENTS_TABLE

            return await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({
                    product,
                    price,
                    description,
                    client,
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
                        .andWhere('payments.client_id', client)
                        .andWhere('payments.status', 'APPROVED')
                })
                .first()
        }catch(e:any){
            throw new Error(`Erro ao buscar o pedido solicitado: ${e.message || e}`)
        }
    }


    public findOrderById = async(id:string):Promise<OrderModel | undefined>=>{
        try{
            
            const [order] = await ConnectToDatabase.con(this.ORDER_TABLE).where({ id })
            
            return order
        }catch(e:any){
            throw new Error(`Erro ao buscar o pedido pelo ID: ${e.message || e}`)
        }
    }

    
    public findAllOrders = async(providerId:string):Promise<OrderModel[]>=>{
        try{
            
            return await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({ provider: providerId })

        }catch(e:any){
            throw new Error(`Erro ao buscar todos os pedidos: ${e.message || e}`)
        }
    }


    public findVisibleOrdersByProvider = async(providerId:string):Promise<OrderModel[]>=>{
        try{
            const db = ConnectToDatabase.con

            return await db(this.ORDER_TABLE)
                .select(`${this.ORDER_TABLE}.*`)
                .select(
                    db.raw(
                        `CASE WHEN EXISTS (
                            SELECT 1
                            FROM ?? AS payment_orders
                            JOIN ?? AS payments
                                ON payments.id = payment_orders.payment_id
                            WHERE payment_orders.order_id = ??.id
                                AND payments.status = ?
                        ) THEN 'APPROVED' ELSE NULL END AS payment_status`,
                        [
                            this.PAYMENT_ORDERS_TABLE,
                            this.PAYMENTS_TABLE,
                            this.ORDER_TABLE,
                            'APPROVED'
                        ]
                    )
                )
                .select(
                    db.raw(
                        `(
                            SELECT MIN(payments.approved_at)
                            FROM ?? AS payment_orders
                            JOIN ?? AS payments
                                ON payments.id = payment_orders.payment_id
                            WHERE payment_orders.order_id = ??.id
                                AND payments.status = ?
                        ) AS payment_approved_at`,
                        [
                            this.PAYMENT_ORDERS_TABLE,
                            this.PAYMENTS_TABLE,
                            this.ORDER_TABLE,
                            'APPROVED'
                        ]
                    )
                )
                .where({ provider: providerId })
                .whereNull('archived_at')
        }catch(e:unknown){
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao buscar pedidos visíveis do fornecedor: ${message}`)
        }
    }


    public findArchiveOrdersByProvider = async(providerId:string):Promise<OrderModel[]>=>{
        try{
            return await ConnectToDatabase.con(`${this.ORDER_TABLE} as orders`)
                .leftJoin(
                    `${this.PAYMENT_ORDERS_TABLE} as payment_orders`,
                    'payment_orders.order_id',
                    'orders.id'
                )
                .leftJoin(
                    `${this.PAYMENTS_TABLE} as payments`,
                    'payments.id',
                    'payment_orders.payment_id'
                )
                .select('orders.*')
                .select('payments.status as payment_status')
                .where('orders.provider', providerId)
                .whereNotNull('orders.archived_at')
                .orderBy('orders.archived_at', 'desc')
        }catch(e:unknown){
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao buscar pedidos arquivados: ${message}`)
        }
    }


    public findRecentOrders = async(providerId:string):Promise<OrderModel[]>=>{
        try{

            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth()

            const startOfLastMonth = new Date(year, month - 1, 1)
            const endOfCurrentMonth = new Date(year, month + 1, 0, 23, 59, 59)
            
            
            return await ConnectToDatabase.con(this.ORDER_TABLE)
                .join(this.USER_TABLE, `${this.USER_TABLE}.id`, `${this.ORDER_TABLE}.client`)
                .where(`${this.ORDER_TABLE}.provider`, providerId)
                .whereBetween(`${this.ORDER_TABLE}.moment`, [startOfLastMonth, endOfCurrentMonth])
                .select(
                    `${this.ORDER_TABLE}.id`,
                    `${this.USER_TABLE}.username`,
                    `${this.ORDER_TABLE}.product`,
                    `${this.ORDER_TABLE}.total`,
                    `${this.ORDER_TABLE}.state`
                ).distinct()

        }catch(e:any){
            throw new Error(`Erro ao buscar todos os pedidos: ${e.message || e}`)
        }
    }


    public findOrdersByMonth = async(providerId:string):Promise<OrdersByMonthModel[]>=>{
        try{
            const allOrders = await this.findAllOrders(providerId)
            const monthCounts: { [key:string]:number } = {}

            for(const order of allOrders){
                const date = new Date(order.moment)
                const year = date.getUTCFullYear()
                const month = String(date.getUTCMonth() + 1).padStart(2, '0')
                const key = `${year}-${month}`

                monthCounts[key] = (monthCounts[key] || 0) + 1
            }

            const result:OrdersByMonthModel[] = Object.keys(monthCounts).map((key)=>({
                month: key,
                orders: monthCounts[key]
            }))

            result.sort((a, b) => b.month.localeCompare(a.month))

            return result
        }catch(e:any){
            throw new Error(`Erro ao buscar pedidos por mês: ${e.message || e}`)
        }
    }


    public findActiveOrdersByClient = async(client:string):Promise<OrderModel[]>=>{
        try{
            const paymentOrdersTable = this.PAYMENT_ORDERS_TABLE
            const paymentsTable = this.PAYMENTS_TABLE

            return await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({ client, state: 'REQUESTED' })
                .whereNotExists(function(){
                    this.select(1)
                        .from(`${paymentOrdersTable} as payment_orders`)
                        .join(
                            `${paymentsTable} as payments`,
                            'payments.id',
                            'payment_orders.payment_id'
                        )
                        .whereRaw('payment_orders.order_id = orders.id')
                        .andWhere('payments.client_id', client)
                        .andWhere('payments.status', 'APPROVED')
                })

        }catch(e:any){
            throw new Error(`Erro ao buscar pedidos ativos: ${e.message || e}`)
        }
    }


    public findAllOrdersByClient = async(client:string, providerId:string):Promise<OrderModel[]>=>{
        try{
            const db = ConnectToDatabase.con

            return await db(this.ORDER_TABLE)
                .select(`${this.ORDER_TABLE}.*`)
                .select(
                    db.raw(
                        `CASE WHEN EXISTS (
                            SELECT 1
                            FROM ?? AS payment_orders
                            JOIN ?? AS payments
                                ON payments.id = payment_orders.payment_id
                            WHERE payment_orders.order_id = ??.id
                                AND payments.status = ?
                        ) THEN 'APPROVED' ELSE NULL END AS payment_status`,
                        [
                            this.PAYMENT_ORDERS_TABLE,
                            this.PAYMENTS_TABLE,
                            this.ORDER_TABLE,
                            'APPROVED'
                        ]
                    )
                )
                .select(
                    db.raw(
                        `(
                            SELECT MIN(payments.approved_at)
                            FROM ?? AS payment_orders
                            JOIN ?? AS payments
                                ON payments.id = payment_orders.payment_id
                            WHERE payment_orders.order_id = ??.id
                                AND payments.status = ?
                        ) AS payment_approved_at`,
                        [
                            this.PAYMENT_ORDERS_TABLE,
                            this.PAYMENTS_TABLE,
                            this.ORDER_TABLE,
                            'APPROVED'
                        ]
                    )
                )
                .where({ client, provider: providerId })
                .whereNull('archived_at')
        }catch(e:any){
            throw new Error(`Erro ao buscar pedidos do cliente: ${e.message || e}`)
        }
    }


    public findPaidOrdersByClient = async(clientId:string):Promise<OrderModel[]>=>{
        try{
            return await ConnectToDatabase.con(this.ORDER_TABLE)
                .join(
                    this.PAYMENT_ORDERS_TABLE,
                    `${this.PAYMENT_ORDERS_TABLE}.order_id`,
                    `${this.ORDER_TABLE}.id`
                )
                .join(
                    this.PAYMENTS_TABLE,
                    `${this.PAYMENTS_TABLE}.id`,
                    `${this.PAYMENT_ORDERS_TABLE}.payment_id`
                )
                .where(`${this.PAYMENTS_TABLE}.client_id`, clientId)
                .andWhere(`${this.PAYMENTS_TABLE}.status`, 'APPROVED')
                .select(`${this.ORDER_TABLE}.*`)
                .distinct()
        }catch(e:unknown){
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao buscar pedidos pagos: ${message}`)
        }
    }


    public findFinishedOrdersByClient = async(client:string):Promise<OrderModel[]>=>{
        try{
            
            return await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({ client, state: 'FINISHED' })

        }catch(e:any){
            throw new Error(`Erro ao buscar pedidos concluídos: ${e.message || e}`)
        }
    }
        
    
    public deleteOrder = async(order:OrderModel):Promise<void>=>{
        let deleteOrder: OrderModel

        try{

            deleteOrder = await ConnectToDatabase.con.transaction(async (trx)=>{
                const currentOrder: OrderModel | undefined = await trx(this.ORDER_TABLE)
                    .where({ id: order.id })
                    .forUpdate()
                    .first()
                
                if(!currentOrder){
                    throw new AppError(404, 'Pedido não encontrado')   
                }

                const paymentLink = await trx(this.PAYMENT_ORDERS_TABLE)
                    .where({ order_id: currentOrder.id })
                    .first('payment_id')

                if(paymentLink){
                    throw new AppError(
                        409,
                        'Este pedido está vinculado a um pagamento e não pode ser excluído.'
                    )
                }

                if(currentOrder.state === 'REQUESTED'){
                    const restoredProducts = await trx(this.PRODUCT_TABLE)
                        .where({
                            id: currentOrder.productid,
                            provider: currentOrder.provider
                        })
                        .increment('stock', currentOrder.quantity)
                        .returning('id')

                    if(restoredProducts.length !== 1){
                        throw new Error('Não foi possível devolver o estoque do produto.')
                    }
                }

                await trx(this.ORDER_TABLE)
                    .where({ id: currentOrder.id })
                    .delete()

                return currentOrder
            })
        }catch(e:unknown){
            if(e instanceof AppError){
                throw e
            }

            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao deletar pedido: ${message}`)
        }

        try{
            await new ProviderNotificationData().saveProviderNofitication(
                `Um pedido de ${deleteOrder.product} foi removido`,
                deleteOrder.provider
            )
        }catch(e:unknown){
            console.error(
                `Pedido ${deleteOrder.id} foi excluído, mas a notificação ao fornecedor ${deleteOrder.provider} falhou:`,
                e
            )
        }

    }


    public archiveOrder = async(orderId:string, providerId:string):Promise<void>=>{
        const updatedRows = await ConnectToDatabase.con(this.ORDER_TABLE)
            .where({
                id: orderId,
                provider: providerId
            })
            .whereIn('state', ['EXPIRED', 'FINISHED'])
            .whereNull('archived_at')
            .update({ archived_at: new Date() })

        if(updatedRows !== 1){
            throw new AppError(409, 'Somente pedidos expirados ou finalizados podem ser arquivados.')
        }
    }


    public updateOrderQuantity = async(quantity:number, id:string):Promise<void>=>{
        try{

            await ConnectToDatabase.con.transaction(async(trx)=>{
                const order:OrderModel = await trx(this.ORDER_TABLE)
                    .where({ id })
                    .forUpdate()
                    .first()
                
                if(!order){
                    throw new AppError(404, 'Pedido não encontrado')
                }

                if(order.state !== 'REQUESTED'){
                    throw new AppError(409, 'Só é possível alterar pedidos solicitados.')
                }

                const paymentForOrder = await trx({
                    paymentOrder: this.PAYMENT_ORDERS_TABLE
                })
                    .join(
                        { payment: this.PAYMENTS_TABLE },
                        'payment.id',
                        'paymentOrder.payment_id'
                    )
                    .where('paymentOrder.order_id', order.id)
                    .whereIn('payment.status', ['PENDING', 'APPROVED'])
                    .first('payment.id')

                if(paymentForOrder){
                    throw new AppError(
                        409,
                        'Não é possível alterar a quantidade enquanto o pagamento estiver pendente ou aprovado.'
                    )
                }

                const difference = quantity - order.quantity

                if(difference > 0){
                    const updated = await trx(this.PRODUCT_TABLE)
                        .where({
                            id: order.productid,
                            provider: order.provider
                        })
                        .where('stock', '>=', difference)
                        .decrement('stock', difference)
                        .returning('id')

                    if(updated.length !== 1){
                        throw new StockConflictError()
                    }
                }else if(difference < 0){
                    const restoredProducts = await trx(this.PRODUCT_TABLE)
                        .where({
                            id: order.productid,
                            provider: order.provider
                        })
                        .increment('stock', Math.abs(difference))
                        .returning('id')

                    if(restoredProducts.length !== 1){
                        throw new Error('Não foi possível devolver o estoque: produto do pedido não encontrado.')
                    }
                }

                await trx(this.ORDER_TABLE)
                    .where({ id })
                    .update({
                        quantity: quantity,
                        total: quantity * order.price
                    })
            })    
        }catch(e:unknown){
            if(e instanceof AppError || e instanceof StockConflictError){
                throw e
            }
            const message = e instanceof Error ? e.message : String(e)
            throw new Error(`Erro ao atualizar quantidade: ${message}`)
        }
    }


    public updateOrderStatusToFinished = async(
        id:string,
        providerId:string
    ):Promise<void>=>{
        try{
            const updatedRows = await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({ id, provider: providerId, state: 'REQUESTED' })
                .update({ state: 'FINISHED' })

            if(updatedRows === 0){
                throw new AppError(404, 'Pedido não encontrado para este fornecedor')
            }

        }catch(e:any){
            if(e instanceof AppError) throw e
            throw new Error(`Erro ao marcar o pedido como concluído: ${e.message || e}`)
        }
    }


    public updateOrderStatusToRequested = async(
        id:string,
        providerId:string
    ):Promise<void>=>{
        try{
            const updatedRows = await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({ id, provider: providerId, state: 'FINISHED' })
                .update({ state: 'REQUESTED' })

            if(updatedRows === 0){
                throw new AppError(404, 'Pedido não encontrado para este fornecedor')
            }

        }catch(e:any){
            if(e instanceof AppError) throw e
            throw new Error(`Erro ao reverter o pedido para solicitado: ${e.message || e}`)
        }
    }


    public deleteFinishedOrdersByClient = async(client:string):Promise<void>=>{
        try{

            await ConnectToDatabase.con(this.ORDER_TABLE).delete().where({
                client,
                state: 'FINISHED'
            })


        }catch(e:any){
            throw new Error(`Erro ao limpar o histórico de pedidos concluídos: ${e.message || e}`)
        }
    }

    
    // public deleteRequestedOrdersByProvider = async(client:string, provider:string):Promise<void>=>{
    //     try{

    //         await ConnectToDatabase.con.transaction(async(trx)=>{
    //             const requestedOrders = await trx(this.ORDER_TABLE)
    //                 .select('id', 'productId', 'quantity')
    //                 .where({
    //                     client,
    //                     provider,
    //                     state: 'REQUESTED'
    //                 })
    //                 .forUpdate()

    //             if(requestedOrders.length === 0) return

    //             const quantityByProduct = new Map<string, number>()

    //             for(const order of requestedOrders){
    //                 const previousQuantity = quantityByProduct.get(order.productId) ?? 0
    //                 quantityByProduct.set(
    //                     order.productId,
    //                     previousQuantity + order.quantity
    //                 )
    //             }

    //             for(const [productId, quantity] of quantityByProduct){
    //                 const restoredProducts = await trx(this.PRODUCT_TABLE)
    //                     .where({ id: productId, provider })
    //                     .increment('stock', quantity)
    //                     .returning('id')
                    
    //                 if(restoredProducts.length !== 1){
    //                     throw new Error(
    //                         `Não foi possível devolver o estoque do produto ${productId}.`
    //                     )
    //                 }
    //             }

    //             const orderIds = requestedOrders.map((order) => order.id)

    //             await trx(this.ORDER_TABLE)
    //                 .whereIn('id', orderIds)
    //                 .delete()
    //         })
    //     }catch(e:any){
    //         const message = e instanceof Error ? e.message : String(e)
    //         throw new Error(`Erro ao limpar ao limpar as solicitações do provedor: ${message}`)
    //     }
    // }
   
}