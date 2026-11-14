import type { Response } from 'express'


class NotificationSseHub{
    private customerConnections = new Map<string, Set<Response>>()
    private providerConnections = new Map<string, Set<Response>>()


    private writeNotification(
        connections: Map<string, Set<Response>>,
        recipientId: string,
        payload: unknown
    ):void{
        const clients = connections.get(recipientId)

        if(!clients){
            return
        }

        const message =
            `event: notification\n`+
            `data: ${JSON.stringify(payload)}\n\n`

        for(const client of clients){
            client.write(message)
        }
    }

    addCustomerConnection(customerId:string, response:Response):void{
        const clients = this.customerConnections.get(customerId) ?? new Set<Response>()
        clients.add(response)
        this.customerConnections.set(customerId, clients)
    }

    removeCustomerConnection(customerId:string, response:Response):void{
        const clients = this.customerConnections.get(customerId)

        if(!clients) return

        clients.delete(response)

        if(clients.size === 0){
            this.customerConnections.delete(customerId)
        }
    }

    sendCustomerNotification(customerId:string, notification:unknown):void{
        this.writeNotification(
            this.customerConnections,
            customerId,
            notification
        )
    }

    sendCustomerNotificationToAll(customerIds:string[], notification:unknown):void{
        for(const customerId of customerIds){
            this.sendCustomerNotification(customerId, notification)
        }
    }

    addProviderConnection(providerId:string, response:Response):void{
        const clients = this.providerConnections.get(providerId) ?? new Set<Response>()
        clients.add(response)
        this.providerConnections.set(providerId, clients)
    }

    removeProviderConnection(providerId:string, response:Response):void{
        const clients = this.providerConnections.get(providerId)

        if(!clients) return

        clients.delete(response)

        if(clients.size === 0){
            this.providerConnections.delete(providerId)
        }
    }

    sendProviderNotification(providerId:string, notification:unknown):void{
        this.writeNotification(
            this.providerConnections,
            providerId,
            notification
        )
    }
}

export const notificationSseHubs = new NotificationSseHub()