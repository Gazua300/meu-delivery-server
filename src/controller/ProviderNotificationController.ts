import { Request, Response } from "express"
import ProviderNotificationBusiness from "../business/ProviderNotificationBusiness";
import Services, { AppError } from "../services/Authentication"
import { notificationSseHubs } from "../services/NotificationSSeHubs"


export default class ProviderNotificationController{
    constructor(
        private notificationBusiness:ProviderNotificationBusiness,
        private services:Services
    ){}


    private handleError(res: Response, error: any): void {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }

        res.status(500).json({
            message: error.message || "An unexpected internal server error occurred."
        });
    }

/* ENDPOINTS */
    public streamProviderNotifications = async(req:Request, res:Response):Promise<void>=>{
        try{
            const provider = await this.services.authenticateRestaurant(req)

            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('X-Accel-Buffering', 'no')
            res.flushHeaders()

            notificationSseHubs.addProviderConnection(provider.id, res)
            res.write(': connected\n\n')

            const heartbeat = setInterval(()=>{
                if(!res.destroyed){
                    res.write(': keepalive\n\n')
                }
            }, 25000)

            req.on('close', ()=>{
                clearInterval(heartbeat)
                notificationSseHubs.removeProviderConnection(provider.id, res)
            })
        }catch(error:any){
            this.handleError(res, error)
        }
    }

    public findProviderNotifications = async(req:Request, res:Response):Promise<void>=>{
        try{
            const provider = await this.services.authenticateRestaurant(req)
            const notifications = await this.notificationBusiness.findProviderNotifications(provider.id)
            
            res.status(200).json(notifications)
        }catch(error:any){
            this.handleError(res, error)
        }
    }


    public updateProviderNotification = async(req:Request, res:Response):Promise<void>=>{
        try{
            const provider = await this.services.authenticateRestaurant(req)
            await this.notificationBusiness.updateProviderNotification(provider.id, req.params.id as string)

            res.status(200).end()
        }catch(error:any){
            this.handleError(res, error)
        }
    }


    public updateAllProviderNotifications = async(req:Request, res:Response):Promise<void>=>{
        try{
            const provider = await this.services.authenticateRestaurant(req)
            await this.notificationBusiness.updateAllProviderNotifications(provider.id)

            res.status(200).end()
        }catch(error:any){
            this.handleError(res, error)
        }
    }

}






