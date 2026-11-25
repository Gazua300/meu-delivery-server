import nodemailer from 'nodemailer'



export default class EmailService{
    private transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: process.env.ETHEREAL_USER,
            pass: process.env.ETHEREAL_PASSWORD
        }
    })


    public sendPasswordResetEmail = async(email:string, token:string):Promise<string>=>{
        const customertUrl = process.env.CUSTOMER_CLIENT_URL

        const info = await this.transporter.sendMail({
            from: 'Aplicativo Meu Delivery',
            to: email,
            subject: 'Solicitação de redefinição de senha',
            html: `
                <h2>Redefinição de senha</h2>
                <p><a href="${customertUrl}/reset-request?anything=${token}" target="_blank">Clique aqui</a> para cadastrar uma nova senha.</p>
                <p>Este código expira em 15 minutos.</p>
            `
        })
        
        const previewUrl = nodemailer.getTestMessageUrl(info)
        if(!previewUrl){
            throw new Error('Não foi possível gerar a pré-visualização do e-mail.')
        }

        return previewUrl
    }
    
    
    public restaurantPasswordResetEmail = async(email:string, token:string):Promise<string>=>{
        const providerUrl = process.env.PROVIDER_CLIENT_URL

        const info = await this.transporter.sendMail({
            from: 'Aplicativo Meu Delivery Provedor',
            to: email,
            subject: 'Solicitação de redefinição de senha',
            html: `
                <h2>Redefinição de senha</h2>
                <p><a href="${providerUrl}/reset-request?anything=${token}" target="_blank">Clique aqui</a> para cadastrar uma nova senha.</p>
                <p>Este código expira em 15 minutos.</p>
            `
        })
        
        const previewUrl = nodemailer.getTestMessageUrl(info)
        if(!previewUrl){
            throw new Error('Não foi possível gerar a pré-visualização do e-mail.')
        }

        return previewUrl
    }
}