import ConnectToDatabase from "../data/Connexion"
import CustomerNotificationData from "../data/CustomerNotificationData"


export default class Product extends ConnectToDatabase{
    protected PRODUCT_TABLE = 'products'

    constructor(
        private category:string,
        private description:string,
        private id:string,
        private name:string,
        private photoUrl:string | null,
        private price:number,
        private stock:number,
        private provider:string,
        private status:string
    ){ super() }

    save = async(providerName:string):Promise<void>=>{
        try{
            await ConnectToDatabase.con(this.PRODUCT_TABLE).insert({
                category: this.category,
                description: this.description,
                id: this.id,
                name: this.name,
                photoUrl: this.photoUrl,
                price: this.price,
                stock: this.stock,
                provider: this.provider,
                status: this.status
            })

            await new CustomerNotificationData().saveCustomerNofitication(
                `${this.name} foi adicionado ao estoque do(a) ${providerName}.`,
                this.provider
            )
        }catch(e:any){
            throw new Error(`Falha ao adicionar produto: ${e.message || e}`)
        }
    }
}