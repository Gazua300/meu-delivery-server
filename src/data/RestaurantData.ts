import ConnectToDatabase from "./Connexion"
import { randomUUID as uuidv4 } from "crypto"
import Restaurant from "../model/Restaurant"
import Product from "../model/Products"
import { ProductModel, RestaurantModel, OrderModel } from "../model/typesAndInterfaces"
import CustomerNotificationData from "./CustomerNotificationData"



export default class RestaurantData extends ConnectToDatabase{
    protected RESTAURANT_TABLE = 'restaurants'
    protected PRODUCT_TABLE = 'products'
    protected ORDER_TABLE = 'orders'
    protected RESET_PASSWORD_TABLE = 'reset_password'


    public createRestaurant = async (restaurant: Restaurant): Promise<void> => {
        try {
            await restaurant.save()
        } catch (error: any) {
            throw new Error(`Erro ao registrar estabelecimento: ${error.message || error}`)
        }
    }


    public getRestaurants = async():Promise<RestaurantModel[]>=>{
        try{

            const restaurant = await ConnectToDatabase.con(this.RESTAURANT_TABLE).select(
                'address', 'phone', 'description', 'id', 'logourl', 'name', 'email', 'role'
            )

            return restaurant
        }catch(e:any){
            throw new Error(`Erro ao buscar estabelecimento: ${e.message || e}`)
        }
    }


    public findRestaurantById = async(id:string):Promise<RestaurantModel>=>{
        try{

            const [restaurant] = await ConnectToDatabase.con(this.RESTAURANT_TABLE)
            .select('address', 'phone', 'description', 'id', 'logourl', 'name', 'email', 'role')
            .where({ id })

            return restaurant
        }catch(e:any){
            throw new Error(`Erro ao buscar estabelecimento pelo ID: ${e.message || e}`)
        }
    }


    public findPasswordByRestaurantId = async(id:string):Promise<RestaurantModel>=>{
        try{

            const [restaurantPassword] = await ConnectToDatabase.con(this.RESTAURANT_TABLE)
            .select('password')
            .where({ id })

            return restaurantPassword
        }catch(e:any){
            throw new Error(`Erro ao buscar senha: ${e.message || e}`)
        }
    }
    

    findRestaurantByEmail = async(email:string):Promise<RestaurantModel>=>{
        try{

            const [restaurant] = await ConnectToDatabase.con(this.RESTAURANT_TABLE).where({ email })

            return restaurant
        }catch(e:any){
            throw new Error(`Erro ao buscar estabelecimento pelo email: ${e.message || e}`)
        }
    }


    findRestaurantByPhone = async(phone:string):Promise<RestaurantModel>=>{
        try{

            const [restaurant] = await ConnectToDatabase.con(this.RESTAURANT_TABLE)
                .select('phone')
                .where({ phone })

            return restaurant
        }catch(e:any){
            throw new Error(`Erro ao buscar estabelecimento pelo telefone: ${e.message || e}`)
        }
    }


    public updateRestaurant = async (
        id: string, 
        name: string, 
        address: string, 
        phone: string
    ): Promise<void> => {
        try {
            await ConnectToDatabase.con(this.RESTAURANT_TABLE)
                .update({ name, address, phone })
                .where({ id })
        } catch (error: any) {
            throw new Error(`Falha ao atualizar dados do provedor: ${error.message || error}`)
        }
    }


    public saveResetToken = async (restaurant_id: string, token: string): Promise<void> => {
        try {
            await ConnectToDatabase.con(this.RESET_PASSWORD_TABLE)
                .insert({
                    id: uuidv4(),
                    restaurant_id,
                    token: token,
                    expires_at: new Date(Date.now() + 15 * 60 * 1000)
                })
        } catch (error: any) {
            throw new Error(`Falha ao resetar token: ${error.message || error}`)
        }
    }


    public updatePassword = async (id: string, newPasswordHash: string): Promise<void> => {
        try {
            await ConnectToDatabase.con(this.RESTAURANT_TABLE)
                .update({ password: newPasswordHash })
                .where({ id })
        } catch (error: any) {
            throw new Error(`Falha ao atualizar senha: ${error.message || error}`)
        }
    }


    public clearResetToken = async (id: string): Promise<void> => {
        try {
            await ConnectToDatabase.con(this.RESET_PASSWORD_TABLE)
                .del()
                .where({ id })
        } catch (error: any) {
            throw new Error(`Falha ao resetar token: ${error.message || error}`)
        }
    }

    public deleteRestaurantAccount = async (id: string): Promise<void> => {
        try {

            const [restaurant] = await ConnectToDatabase.con(this.RESTAURANT_TABLE)
                .where({ id })

            await ConnectToDatabase.con.transaction(async(trx)=>{

                await trx(this.ORDER_TABLE).where({ provider: id }).del()
                await trx(this.PRODUCT_TABLE).where({ provider: id }).del()
                await trx(this.RESTAURANT_TABLE).where({ id }).del()

            })

            await new CustomerNotificationData().saveCustomerNofitication(
                `${restaurant.name} deleteou sua conta do My Delivery,`,
                restaurant.id
            )
        } catch (error: any) {
            throw new Error(`Falha ao deletar conta: ${error.message || error}`)
        }
    }
    

// ======================= PRODUCTS ========================

    public insertProduct = async(product:Product, providerId:string):Promise<void>=>{
        try{
            
            const [restaurant] = await ConnectToDatabase.con(this.RESTAURANT_TABLE)
                .where({ id: providerId })
            const restaurantName = restaurant.name

            await product.save(restaurantName)

        }catch(e:any){
            throw new Error(`Erro ao inserir produto: ${e.message || e}`)
        }
    }


    public updateProduct = async(
        category:string, 
        description:string, 
        id:string, 
        name:string, 
        photoUrl:string,
        price:number, 
        stock:number,
        status:string
    ):Promise<void>=>{
        try{

            const [product] = await ConnectToDatabase.con<ProductModel>(this.PRODUCT_TABLE).where({ id })
            const previousStock = product.stock
            const provider = product.provider

            await ConnectToDatabase.con(this.PRODUCT_TABLE).update({
                category, description, name, price, photoUrl, stock, status
            }).where({ id })
            
            if(previousStock >= 150 && stock < 150){
                await new CustomerNotificationData().saveCustomerNofitication(
                    `O estoque do produto ${name} está acabando`,
                    provider
                )
            }

            if(previousStock < 150 && stock >= 150){
                await new CustomerNotificationData().saveCustomerNofitication(
                    `O estoque do produto ${name} foi aumentado. Aproveite!`,
                    provider
                )
            }
            
        }catch(e:any){
            throw new Error(`Erro ao atualizar produto: ${e.message || e}`)
        }
    }
    

   public findProduct = async(name:string, category:string, description:string):Promise<ProductModel | undefined>=>{
        try{

            const [product] = await ConnectToDatabase.con(this.PRODUCT_TABLE).where({
                name,
                category,
                description
            })

            return product
        }catch(e:any){
            throw new Error(`Erro ao buscar produto por nome: ${e.message || e}`)
        }
    }


    public findAllProducts = async(providerId:string):Promise<ProductModel[]>=>{
        try{

            const products = await ConnectToDatabase.con(this.PRODUCT_TABLE)
                .where({ provider: providerId})
            
            return products
        }catch(e:any){
            throw new Error(`Erro ao buscar cardápio dos produtos: ${e.message || e}`)
        }
    }


    public allProductsByClientSide = async(providerId:string):Promise<ProductModel[]>=>{
        try{

            const productsByClientSide = await ConnectToDatabase.con(this.PRODUCT_TABLE)
                .where('stock', '>', 0)
                .andWhere({ provider: providerId })
            
            return productsByClientSide
        }catch(e:any){
            throw new Error(`Erro ao buscar cardápio dos produtos: ${e.message || e}`)
        }
    }


    public findProductById = async(id:string):Promise<ProductModel | undefined>=>{
        try{

            const [product] = await ConnectToDatabase.con(this.PRODUCT_TABLE)
                .where({ id })
            
            return product
        }catch(e:any){
            throw new Error(`Erro ao buscar produto pelo ID: ${e.message | e}`)
        }
    }


    public deleteProduct = async(product:ProductModel):Promise<void>=>{
        try{

            const [productProvider] = await ConnectToDatabase.con<RestaurantModel>(this.RESTAURANT_TABLE).where({ id: product.provider})

            await ConnectToDatabase.con(this.PRODUCT_TABLE).where({ id: product.id }).del()
            await new CustomerNotificationData().saveCustomerNofitication(
                `${product.name} foi removido por ${productProvider.name}`,
                product.provider
            )
        }catch(e:any){
            throw new Error(`Erro ao deletar produto: ${e.message || e}`)
        }
    }

// ======================= ORDERS ========================
    public findAllRequesteOrders = async(id:string):Promise<OrderModel[]>=>{
        try{

            const orders = await ConnectToDatabase.con(this.ORDER_TABLE)
                .where({ provider: id })

            return orders
        }catch(e:any){
            throw new Error(`Erro ao buscar pedidos: ${e.message || e}`)
        }   
    }
}