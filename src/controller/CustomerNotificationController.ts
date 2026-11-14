import { Request, Response } from "express"
import CustomerNotificationBusiness from "../business/CustomerNotificationBusiness";
import Services, { AppError } from "../services/Authentication"
import { notificationSseHubs } from "../services/NotificationSSeHubs"


export default class CustomerNotificationController{
    constructor(
        private notificationBusiness:CustomerNotificationBusiness,
        private services:Services
    ){}


    private handleError(res: Response, error: any): void {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }

        res.status(500).json({
            message: error.message || "Ocorreu um erro interno inesperado no servidor."
        });
    }

/* ENDPOINTS */
    public streamCustomerNotifications = async(req:Request, res:Response):Promise<void>=>{
        try{
            const customer = await this.services.authenticateUser(req)

            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('X-Accel-Buffering', 'no')
            res.flushHeaders()

            notificationSseHubs.addCustomerConnection(customer.id, res)
            res.write(': connected\n\n')

            const heartbeat = setInterval(()=>{
                if(!res.destroyed){
                    res.write(': keepalive\n\n')
                }
            }, 25000)

            req.on('close', ()=>{
                clearInterval(heartbeat)
                notificationSseHubs.removeCustomerConnection(customer.id, res)
            })
        }catch(error:any){
            this.handleError(res, error)
        }
    }

    public findCustomerNotifications = async(req:Request, res:Response):Promise<void>=>{
        try{
            const customer = await this.services.authenticateUser(req)
            const notifications = await this.notificationBusiness.findCustomerNotifications(customer.id)
            
            res.status(200).json(notifications)
        }catch(error:any){
            this.handleError(res, error)
        }
    }


    public updateCustomerNotification = async(req:Request, res:Response):Promise<void>=>{
        try{
            const customer = await this.services.authenticateUser(req)
            await this.notificationBusiness.updateCustomerNotification(customer.id, req.params.id as string)

            res.status(200).end()
        }catch(error:any){
            this.handleError(res, error)
        }
    }


    public updateAllCustomerNotifications = async(req:Request, res:Response):Promise<void>=>{
        try{
            const customer = await this.services.authenticateUser(req)
            await this.notificationBusiness.updateAllCustomerNotifications(customer.id)

            res.status(200).end()
        }catch(error:any){
            this.handleError(res, error)
        }
    }

}






