import { Request, Response } from "express";
import OrderBusiness, { CreateOrderDTO, PaymentDTO } from "../business/OrderBusiness";
import Services, { AppError } from "../services/Authentication";
import { timingSafeEqual } from "crypto";

export default class OrderController {
    constructor(
        private orderBusiness: OrderBusiness,
        private services: Services
    ) {}


    private handleError(res: Response, error: any): void {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }

        res.status(500).json({ 
            message: error.message || "Um erro inesperado ocorreu no servidor" 
        });
    }

    public createOrder = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req);
            const orderDTO: CreateOrderDTO = req.body;

            await this.orderBusiness.createOrder(user, orderDTO);

            res.status(201).send(`'${orderDTO.product}' adicionado com sucesso à sua lista de pedidos.`)
        } catch (error: any) {
            this.handleError(res, error)            
        }
    };

    public getOrderById = async (req: Request, res: Response): Promise<void> => {
        try {
            const actor = await this.services.authenticateActor(req)
            const { id } = req.params;
            const order = await this.orderBusiness.getOrderById(id as string, actor);

            res.status(200).json(order);
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public deleteOrder = async (req: Request, res: Response): Promise<void> => {
        try {
            const actor = await this.services.authenticateActor(req)
            const { id } = req.params;
            await this.orderBusiness.deleteOrder(id as string, actor);

            res.status(200).json({ message: "Pedido excluído com sucesso." });
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    // public clearRequestedOrders = async (req: Request, res: Response): Promise<void> => {
    //     try {
    //         const user = await this.services.authenticateUser(req);
    //         const providerId = req.params.id;

    //         await this.orderBusiness.clearRequestedOrders(user.id, providerId as string);

    //         res.status(204).send();
    //     } catch (error: any) {
    //         this.handleError(res, error);
    //     }
    // };

    public clearOrderHistory = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req);

            await this.orderBusiness.clearOrderHistory(user.id);

            res.status(204).send();
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public updateOrderQuantity = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req)
            const { id } = req.params;
            const { quantity } = req.body;

            await this.orderBusiness.updateOrderQuantity(id as string, quantity, user.id);

            res.status(200).json({ message: "Quantidade do pedido atualizada com sucesso." });
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public markOrderAsFinished = async (req: Request, res: Response): Promise<void> => {
        try {
            const restaurant = await this.services.authenticateRestaurant(req);
            const { id } = req.params;

            await this.orderBusiness.markOrderAsFinished(id as string, restaurant.id);

            res.status(200).json({ message: "Status do pedido atualizado para finalizado." });
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public revertOrderToRequested = async (req: Request, res: Response): Promise<void> => {
        try {
            const restaurant = await this.services.authenticateRestaurant(req);
            const { id } = req.params;

            await this.orderBusiness.revertOrderToRequested(id as string, restaurant.id);

            res.status(200).json({ message: "Status do pedido revertido para solicitado." });
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public getActiveOrders = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req);
            const orders = await this.orderBusiness.getActiveOrders(user.id);

            res.status(200).json(orders);
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public getAllOrders = async (req: Request, res: Response): Promise<void> => {
        try {
            const restaurant = await this.services.authenticateRestaurant(req);
            const orders = await this.orderBusiness.getAllOrders(restaurant.id);

            res.status(200).json(orders);
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public getArchivedOrders = async(req:Request, res:Response):Promise<void>=>{
        try{
            const restaurant = await this.services.authenticateRestaurant(req)
            const orders = await this.orderBusiness.getArchivedOrders(restaurant.id)
            res.status(200).json(orders)
        }catch(error:any){
            this.handleError(res, error)
        }
    }

    public getPaidOrders = async(req:Request, res:Response):Promise<void>=>{
        try{
            const user = await this.services.authenticateUser(req)
            const orders = await this.orderBusiness.getPaidOrders(user.id)
            res.status(200).json(orders)
        }catch(error:any){
            this.handleError(res, error)
        }
    }

    public getRecentOrders = async (req: Request, res: Response): Promise<void> => {
        try {
            const restaurant = await this.services.authenticateRestaurant(req);
            const recentOrders = await this.orderBusiness.getRecentOrders(restaurant.id);

            res.status(200).json(recentOrders);
        } catch (error: any) {
            this.handleError(res, error);
        }
    }

    public ordersByMonth = async (req: Request, res: Response): Promise<void> => {
        try {
            const restaurant = await this.services.authenticateRestaurant(req);
            const findOrdersByMonth = await this.orderBusiness.ordersByMonth(restaurant.id);

            res.status(200).json(findOrdersByMonth);
        } catch (error: any) {
            this.handleError(res, error);
        }
    }

    public getActiveOrdersByUserId = async (req: Request, res: Response): Promise<void> => {
        try {
            const restaurant = await this.services.authenticateRestaurant(req);
            const { id } = req.params;

            const orders = await this.orderBusiness.getActiveOrdersByUserId(id as string, restaurant.id);

            res.status(200).json(orders);
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public getFinishedOrders = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req);
            const orders = await this.orderBusiness.getFinishedOrders(user.id);

            res.status(200).json(orders);
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public processPayment = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req)
            const paymentDTO: PaymentDTO = req.body;
            const responseData = await this.orderBusiness.processPayment(paymentDTO, user);

            res.status(200).json({
                orderId: responseData.external_reference,
                status: responseData.status,
                id: responseData.id,
                paymentType: responseData.payment_type_id,
                qrCode: responseData.point_of_interaction?.transaction_data?.qr_code,
                qrCodeBase64: responseData.point_of_interaction?.transaction_data?.qr_code_base64,
                qrCodeLink: responseData.point_of_interaction?.transaction_data?.ticket_url 
                    || responseData.point_of_interaction?.transaction_data?.qr_code_link
            });
        } catch (error: any) {
            this.handleError(res, error);
        }
    };

    public getPaymentStatus = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = await this.services.authenticateUser(req)
            const { id } = req.params;
            const status = await this.orderBusiness.getPaymentStatus(id as string, user);

            res.status(200).json({ status });
        } catch (error: any) {
            this.handleError(res, error);
        }
    };    

    public getPendingPayment = async(req:Request, res:Response):Promise<void>=>{
        try{
            const user = await this.services.authenticateUser(req)
            const payment = await this.orderBusiness.getPendingPayment(user)
            res.status(200).json(payment)
        }catch(error:any){
            this.handleError(res, error)
        }
    }

    public cancelPayment = async(req:Request, res:Response):Promise<void>=>{
        try{
            const user = await this.services.authenticateUser(req)
            const { id } = req.params
            await this.orderBusiness.cancelPayment(id as string, user)
            res.status(200).json({ message: 'Pagamento cancelado com sucesso.' })
        }catch(error:any){
            this.handleError(res, error)
        }
    }

    public reconcileExpiredPendingPayments = async(
        req:Request,
        res:Response
    ):Promise<void>=>{
        try{
            const cronSecret = process.env.CRON_SECRET?.trim()
            if(!cronSecret){
                throw new AppError(503, 'A rotina agendada de pagamentos não está configurada')
            }

            const providedAuthorization = Buffer.from(req.header('authorization') || '')
            const expectedAuthorization = Buffer.from(`Bearer ${cronSecret}`)
            if(
                providedAuthorization.length !== expectedAuthorization.length ||
                !timingSafeEqual(providedAuthorization, expectedAuthorization)
            ){
                throw new AppError(401, 'Não autorizado')
            }

            const result = await this.orderBusiness.reconcileExpiredPendingPayments()
            res.status(200).json(result)
        }catch(error:any){
            this.handleError(res, error)
        }
    }
}