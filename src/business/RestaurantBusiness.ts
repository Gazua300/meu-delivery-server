import RestaurantData from "../data/RestaurantData"
import Restaurant from "../model/Restaurant"
import Product from "../model/Products"
import Services, { AppError } from "../services/Authentication"
import EmailService from "../services/EmailService"
import TokenService from "../services/TokenService"
import { ProductModel, RestaurantModel } from "../model/typesAndInterfaces"



export interface SignupRestaurantDTO{
    name:string
    address:string
    phone:string
    email:string
    logourl:string
    password:string
    description:string
}

export interface UpdateRestaurantDTO{
    name:string
    phone:string
    address:string
}

export interface LoginDTO{
    email?:string
    password?:string
}

export interface RequestPasswordResetDTO {
    email?: string
}

export interface ConfirmPasswordResetDTO {
    newPassword?: string
    currentPassword?: string
}

export interface CreateAndUpdateProductDTO{
    category:string
    description:string
    name:string
    price:number
    image:string,
    stock:number
}




export default class RestaurantBusiness{
    private readonly EMAIL_REGEX = /^[\w\.-]+@[a-zA-Z\d\.-]+\.[a-zA-Z]{2,}$/;
    private readonly PHONE_REGEX = /^(\d{2})9\d{8}$/;


    constructor(
        private restaurantData:RestaurantData,
        private services:Services,
        private tokenService:TokenService,
        private emailService:EmailService
    ){}

    
    public signupRestaurant = async(signupDTO:SignupRestaurantDTO, image:string | null):Promise<string>=>{
        const { name, address , phone, email, password, description } = signupDTO
        

        if (!name || !address || !phone || !email || !password || !description) {
            throw new AppError(400, "Campos de cadastro obrigatórios")
        }

        if(!this.EMAIL_REGEX.test(email)){
            throw new AppError(400, 'Email inválido')
        }

        if(!this.PHONE_REGEX.test(phone)){
            throw new AppError(400, 'Número de telefone inválido (deve ter 11 digitos começando com 9 depois do DDD)')
        }

        const existingRestaurant = await this.restaurantData.findRestaurantByEmail(email)
        const existingPhone = await this.restaurantData.findRestaurantByPhone(phone)
        
        if(existingRestaurant || existingPhone){
            throw new AppError(409, `Email ou telefone já cadastrado`)
        }
        
        
        const id = this.services.idGenerator()
        const token = this.tokenService.generateToken(id)
        const hashedPassword = this.services.hashPassword(password)

        const restaurant = new Restaurant(
            address, 
            phone,
            description, 
            id, 
            image, 
            name,
            email,
            hashedPassword,
            'Administrator'
        )
        
        await this.restaurantData.createRestaurant(restaurant)

        return token
    }


    public loginRestaurant = async(loginDTO:LoginDTO):Promise<string>=>{
        const { email, password } = loginDTO
        
        if (!email || !password) {
            throw new AppError(400, "Por favor, preencha os campos de email e senha.")
        }

        const restaurant = await this.restaurantData.findRestaurantByEmail(email)
        if (!restaurant) {
            throw new AppError(401, "Credenciais inválidas")
        }

        const isPasswordValid = this.services.comparePassword(password, restaurant.password)
        if (!isPasswordValid) {
            throw new AppError(401, "Credenciais inválidas")
        }

        return this.tokenService.generateToken(restaurant.id)
    }


    public getRestaurants = async (): Promise<RestaurantModel[]> => {
        const restaurants = await this.restaurantData.getRestaurants()
        if (restaurants.length === 0) {
            throw new AppError(404, "Estabelecimento não encontrado")
        }

        return restaurants
    }


    public updateRestaurant = async (providerId: string, dto: UpdateRestaurantDTO): Promise<void> => {
        const { name, phone, address } = dto

        if (!name || !phone || !address) {
            throw new AppError(400, "Por favor, preencha os campos obrigatórios")
        }

        await this.restaurantData.updateRestaurant(providerId, name, address, phone)
    }


    public getRestaurantById = async (restaurantId: string): Promise<RestaurantModel> => {
        const restaurant = await this.restaurantData.findRestaurantById(restaurantId)
        if (!restaurant) {
            throw new AppError(404, "Estabelecimento não encontrado")
        }

        return restaurant
    }

    
    public requestPasswordReset = async (dto: RequestPasswordResetDTO): Promise<string> => {
        const { email } = dto

        if (!email) {
            throw new AppError(400, "Necessário preencher o campo de email")
        }

        const user = await this.restaurantData.findRestaurantByEmail(email)
        if (!user) {
            return `Como se trata de uma demonstração, você deve inserir admin@example para ser redirecionado a uma conta de e-mail de teste e redefinir sua senha.`
        }
        
        const resetToken = this.tokenService.generateResetToken(user.id)

        await this.restaurantData.saveResetToken(user.id, resetToken)
        const previewUrl = await this.emailService.restaurantPasswordResetEmail(email, resetToken)

        return previewUrl
    }


    public updatePassword = async (dto: ConfirmPasswordResetDTO, restaurantId:string): Promise<void> => {
        const restaurantPassword = await this.restaurantData.findPasswordByRestaurantId(restaurantId)
        const { newPassword, currentPassword } = dto

        if (!currentPassword || !newPassword) {
            throw new AppError(400, "Por favor, preencha os compos obrigatórios para atualizar sua senha")
        }

        if (newPassword.length < 6) {
            throw new AppError(400, "Nova senha precisa ter ao menos 6 caracteres")
        }

        const isMatch = this.services.comparePassword(currentPassword, restaurantPassword.password)
        if (!isMatch) {
            throw new AppError(400, "Senha atual incorreta")
        }

        const hashedPassword = this.services.hashPassword(newPassword)
        await this.restaurantData.updatePassword(restaurantId, hashedPassword)
        await this.restaurantData.clearResetToken(restaurantId)
    }


    public deleteRestaurantAccount = async(restaurantId:string):Promise<void>=>{
        const orders = await this.restaurantData.findAllRequesteOrders(restaurantId)
        if(orders.length > 0){
            throw new AppError(403, `Você tem ${orders.length} pedidos pendentes`)
        }

        await this.restaurantData.deleteRestaurantAccount(restaurantId)
    }

// ====================== PRODUCTS =============================== 
    public insertProduct = async (productDTO: CreateAndUpdateProductDTO, image:string | null, providerId:string): Promise<void> => {
        const { category, description, name, price, stock } = productDTO
        const stockNumber = Number(stock)
        const status = stockNumber >= 150 ? 'Ativo' : stockNumber > 0 ? 'Baixo estoque' : 'Inativo'

        if (!category || !description || !name || !price || !stock) {
            throw new AppError(400, "Por favor, preencha todos  os campos obrigatórios")
        }

        if(Number(price) === 0){
            throw new AppError(403, 'Você tem que definir um preço')
        }

        if(Number(stock) === 0){
            throw new AppError(403, 'Você não pode adicionar um produto sem estoque')
        }

        const existingProduct = await this.restaurantData.findProduct(name, category, description)
        if (existingProduct) {
            throw new AppError(403, "Este produto já está registrado")
        }        

        const id = this.services.idGenerator()
        const product = new Product(category, description, id, name, image, price, stock, providerId, status)
        

        await this.restaurantData.insertProduct(product, providerId)
    }


    public updateProduct = async (productId: string, image:string | null, updateDTO: CreateAndUpdateProductDTO): Promise<void> => {
        const existingProduct = await this.restaurantData.findProductById(productId)
        if (!existingProduct) {
            throw new AppError(404, "Produto não encontrado")
        }

        const { category, description, name, price, stock } = updateDTO

        if (!category || !description || !name || !price) {
            throw new AppError(400, "Por favor, preencha os campos obrigatórios")
        }

        if(Number(price) === 0){
            throw new AppError(403, 'Você precisa definir um preço')
        }

        const photoUrl = image ? image : existingProduct.photoUrl
        const stockNumber = Number(stock)
        const status = stockNumber >= 150 ? 'Ativo' : stockNumber > 0 ? 'Baixo estoque' : 'Inativo'

        await this.restaurantData.updateProduct(
            category,
            description,
            productId,
            name,
            photoUrl,
            price,
            stock,
            status
        )
    }


    public getAllProducts = async (providerId:string): Promise<ProductModel[]> => {
        const products = await this.restaurantData.findAllProducts(providerId)
        if (products.length === 0) {
            throw new AppError(404, "O cardápio está vazio")
        }

        return products
    }


    public aAllProductsByClientSide = async (providerId:string): Promise<ProductModel[]> => {
        const productsByClientSide = await this.restaurantData.allProductsByClientSide(providerId)
        if (productsByClientSide.length === 0) {
            throw new AppError(404, "O cardápio está vazio")
        }

        return productsByClientSide
    }


    public getProductById = async (productId: string): Promise<ProductModel> => {
        const product = await this.restaurantData.findProductById(productId)
        if (!product) {
            throw new AppError(404, "Produto não encontrado")
        }

        return product
    }


    public deleteProduct = async (productId: string): Promise<void> => {
        const product = await this.restaurantData.findProductById(productId)
        if (!product) {
            throw new AppError(404, "Produto não encontrado")
        }
        
        await this.restaurantData.deleteProduct(product)        
    }
}


