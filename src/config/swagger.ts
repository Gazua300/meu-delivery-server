import swaggerJsdoc from 'swagger-jsdoc'
import path from 'path'



const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Meu Delivery API Server',
            version: '1.0.0',
            description: [
    'Serviço central de API que alimenta Meu Delivery, Meu Delivery Provedor e SaaS Dashboard.',
    '',
    '> **⚠️ Observação:** Este é um projeto de demonstração/portfólio. Algumas rotas (como `DELETE` e `signup`) foram intencionalmente omitidas ou restritas, pois permitiriam criar ou excluir usuários e dados reais em um ambiente público de demonstração.'
            ].join('\n'),
            contact: {
                name: 'Flamarion França',
                url: 'https://meu-porfolio-two.vercel.app/'
            },            
        },
        servers: [
            {
                url: 'https://meu-delivery-server-tau.vercel.app/',
                description: 'Servidor de produção'
            },
            {
                url: 'http://localhost:3003',
                description: 'Servidor local de desenvolvimento'
            }
        ],
        components: {
            securitySchemes: {
                CustomAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Insira seu token JWT (do tipo Bearer) de cliente, sem aspas.'
                },
                MerchantAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Insira seu token JWT Bearer de estabelecimento, sem aspas.'
                }
            }
        }
    },
    apis: [
        path.join(__dirname, '../routes/*.ts'),
        path.join(__dirname, '../routes/*.js'),
        path.join(__dirname, '../api/*.ts'),
        path.join(__dirname, '../api/*.js')
    ]    
}


export const swaggerSpec = swaggerJsdoc(options)
