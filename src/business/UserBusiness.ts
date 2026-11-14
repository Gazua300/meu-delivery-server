import UserData, { AddressDTO } from "../data/UserData"
import Services, { AppError } from "../services/Authentication"
import TokenService from "../services/TokenService"
import EmailService from "../services/EmailService"
import User from "../model/User"
import { UserModel } from "../model/typesAndInterfaces"


export interface SignupDTO {
    name?: string
    email?: string
    phone?: string
    password?: string
}

export interface LoginDTO {
    email?: string
    password?: string
}

export interface RequestPasswordResetDTO {
    email?: string
}

export interface ConfirmPasswordResetDTO {
    newPassword?: string
    confirmNewPassword?: string
}

export interface UpdateUserProfileDTO {
    username?: string
    email?: string
    phone?: string
}



export default class UserBusiness{
    private readonly EMAIL_REGEX = /^[\w\.-]+@[a-zA-Z\d\.-]+\.[a-zA-Z]{2,}$/;
    private readonly PHONE_REGEX = /^(\d{2})9\d{8}$/;


    constructor(
        private userData:UserData,
        private services:Services,
        private tokenService:TokenService,
        private emailService:EmailService
    ){}

//USER FIELD
    public signup = async (dto: SignupDTO): Promise<string> => {
        const { name, email, phone, password } = dto

        if (!name || !email || !phone || !password) {
            throw new AppError(400, "Por favor, preencha todos os campos obrigatórios")
        }

        if (!this.EMAIL_REGEX.test(email)) {
            throw new AppError(400, "Email inválido")
        }

        if (!this.PHONE_REGEX.test(phone)) {
            throw new AppError(400, "Número de telefone inválido (deve ter 11 digitos começando com 9 depois do DDD)")
        }

        if (password.length < 6) {
            throw new AppError(400, "A senha deve ter um mínimo de 6 caracteres")
        }

        const registeredUser = await this.userData.findByEmail(email)
        const registeredPhone = await this.userData.findByPhone(phone)
        
        if(registeredUser || registeredPhone){
            throw new AppError(409, "Esse email ou telefone já estão cadastrados.")
        }
        
        const id = this.services.idGenerator()
        const hashedPassword = this.services.hashPassword(password)
        const token = this.tokenService.generateToken(id)
        const user = new User(id, name, email, phone, hashedPassword)

        await this.userData.createUser(user)

        return token
    }


    public login = async (dto: LoginDTO): Promise<string> => {
        const { email, password } = dto

        if (!email || !password) {
            throw new AppError(400, "Por favor, preencha os campos de email e senha")
        }

        if (!this.EMAIL_REGEX.test(email)) {
            throw new AppError(400, "Email inválido")
        }

        const user = await this.userData.findByEmail(email)
        if (!user) {
            throw new AppError(401, "Usuário não encontrado")
        }

        const isPasswordValid = this.services.comparePassword(password, user.password)
        if (!isPasswordValid) {
            throw new AppError(401, "Usuário não encontrado")
        }

        const token = this.tokenService.generateToken(user.id)

        return token
    }


    public getProfileByUser = async (targetUserId: string): Promise<UserModel> => {
        const profile = await this.userData.getProfile(targetUserId)

        if (!profile) {
            throw new AppError(404, "Perfil do usuário não encontrado")
        }

        return profile
    }


    public getAllUsers = async (providerId:string): Promise<UserModel[]> => {
        const users = await this.userData.getAllUsers(providerId)

        if (users.length === 0) {
            throw new AppError(404, "Perfil do usuário não encontrado")
        }

        return users
    }


    public requestPasswordReset = async (dto: RequestPasswordResetDTO): Promise<string> => {
        const { email } = dto

        if (!email) {
            throw new AppError(400, "Precisa preencher o campo de email")
        }

        const user = await this.userData.findByEmail(email)
        if (!user) {
            return `Como se trata de uma demonstração você tem que por admin@example.com para ser redirecionado para uma conta de email teste e resetar sua senha`
        }
       
        const resetToken = this.tokenService.generateResetToken(user.id)

        await this.userData.saveResetToken(user.id, resetToken)
        const previewUrl = await this.emailService.sendPasswordResetEmail(email, resetToken)

        return previewUrl
    }

    
    public updatePassword = async (dto: ConfirmPasswordResetDTO, userId:string): Promise<void> => {
        const { newPassword, confirmNewPassword } = dto

        if (!confirmNewPassword || !newPassword) {
            throw new AppError(400, "Falta o email, token, ou a nova senha")
        }

        if (newPassword.length < 6) {
            throw new AppError(400, "Nova senha deve ter um mínimo de 6 caracteres")
        }

        if (newPassword !== confirmNewPassword) {
            throw new AppError(400, "As senhas não correspondem")
        }

        const hashedPassword = this.services.hashPassword(newPassword)
        await this.userData.updatePassword(userId, hashedPassword)
        await this.userData.clearResetToken(userId)
    }


    public registerAddress = async (userId: string, addressDTO: AddressDTO): Promise<void> => {
        const { street, cep, number, neighbourhood, city, state, complement } = addressDTO

        if (!street || !cep || !neighbourhood || !city || !state) {
            throw new AppError(400, "Por favor, preencha todos os campos obrigatórios")
        }

        if(!number && !complement){
            throw new AppError(400, "Por favor, coloque o número da casa ou complemento para facilitar a localização")
        }

        await this.userData.registerAddress(userId, addressDTO)
    }


    public updateUser = async (userId: string, dto: UpdateUserProfileDTO): Promise<void> => {
        const { username, email, phone } = dto

        if (!username || !email || !phone) {
            throw new AppError(400, "Por favor, preencha todos os campos obrigatórios")
        }

        const existingUser = await this.userData.findById(userId)
        if(!existingUser){
            throw new AppError(404, 'Usuário não encontrado')
        }
        
        await this.userData.updateUser(userId, username, email, phone)
    }    


    public deleteUser = async (user:UserModel): Promise<void> => {
        const userId = user.id
        const requestedOrdersByUser = await this.userData.findActiveOrdersByClient(userId)
        
        if (requestedOrdersByUser.length > 0) {
            throw new AppError(403, "Você tem pedidos pendentes. Por favor, complete ou cancele antes de deletar sua conta.")
        }

        await this.userData.deleteUser(user)
    }

}