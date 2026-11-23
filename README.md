# Meu Delivery Server

A API REST central para o ecossistema Meu Delivery. O servidor conecta o aplicativo do cliente, o painel da loja e o painel SaaS, compartilhando dados de autenticação, informações sobre lojas e produtos, pedidos, notificações e estatísticas.

## O ecossistema Meu Delivery

- **Meu Delivery** — O aplicativo para o cliente navegar por lojas, fazer pedidos e acompanhar o fluxo de compra.
- **Meu Delivery Provedor** — O aplicativo voltado para o estabelecimento, destinado ao recebimento e gerenciamento de pedidos, bem como à manutenção de produtos e detalhes da loja.
- **SaaS Dashboard** — o painel de gerenciamento e monitoramento do ecossistema.
- **Meu Delivery Server** — a camada de API e integração entre as aplicações e serviços externos.

Os aplicativos web enviam suas solicitações a esta API. O servidor valida a autenticação, aplica regras de negócio e lê ou atualiza dados compartilhados, permitindo que as lojas processem os pedidos dos clientes.

## Funcionalidades da API

- Cadastro de clientes e lojas, autenticação, perfis, endereços e recuperação de senha.
- Descoberta e gerenciamento de lojas, categorias e produtos, incluindo imagens e estoque.
- Criação e consulta autenticada de pedidos, atualizações de status e arquivamento.
- Integração com o Mercado Pago para Pix e cartão, com pagamentos locais associados aos pedidos.
- Expiração de pagamentos pendentes, cancelamento e restauração transacional do estoque.
- Notificações para clientes e lojas, incluindo o gerenciamento do status de leitura.
- Endpoints para estatísticas e receita.
- Documentação interativa de endpoints utilizando Swagger/OpenAPI.

## Tecnologias utilizadas

- Node.js, Express 5, and TypeScript
- Knex.js with PostgreSQL (`pg`)
- JWT and bcryptjs for authentication and password hashing
- Multer for uploads, with Cloudinary as an optional image storage provider
- Nodemailer for password recovery emails
- Swagger UI and `swagger-jsdoc` for API documentation

## Documentação da API

- [Documentação Swagger em ambiente de produção](https://my-delivery-server-nine.vercel.app/api-docs/)
- Servidor local: `http://localhost:3003/api-docs/`

O caminho raiz `/` redireciona para a documentação da API.

## Executar localmente

Requer Node.js, npm e acesso a uma instância do PostgreSQL. A partir do diretório deste projeto:

```bash
npm install
```

Crie um arquivo `.env` na raiz do projeto e configure a conexão com o banco de dados e as definições da aplicação:

```env
PORT=3003
NODE_ENV=development
MYDELIVERY_DB=postgresql://user:password@localhost:5432/mydelivery
JWT_KEY=your_local_secret_key
ACCESS_TOKEN=your_mercado_pago_access_token
CRON_SECRET=your_private_cron_secret
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
UPLOAD_DRIVER=local
```

`ALLOWED_ORIGINS` aceita uma lista de origens separadas por vírgula. `UPLOAD_DRIVER` deve ser definido como `local` ou `cloudinary`. Para utilizar o Cloudinary, configure também `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`.

O serviço de recuperação de senha utiliza `ETHEREAL_USER` e `ETHEREAL_PASSWORD`, juntamente com `CUSTOMER_CLIENT_URL` e `PROVIDER_CLIENT_URL`, para montar os links enviados aos aplicativos.

Para criar eventuais tabelas ausentes no banco de dados configurado, execute:

```bash
npm run migrations
```

As migrações adicionam `orders.archived_at` e criam as tabelas `payments` e
`payment_orders`. Antes de executá-las, confirme que `MYDELIVERY_DB` aponta para
o banco de dados correto; não execute a migração de desenvolvimento contra uma
base de produção sem revisar o destino.

### Expiração de pagamentos

Cada pagamento é calculado a partir dos pedidos persistidos e associado a eles
em `payment_orders`. Um pagamento aprovado não finaliza a entrega: o pedido
permanece solicitado até o estabelecimento marcá-lo como concluído. Pagamentos
recusados, cancelados ou expirados encerram os pedidos associados e devolvem o
estoque em uma transação.

O `ACCESS_TOKEN` do Mercado Pago deve permanecer exclusivamente no ambiente do
servidor. O frontend usa uma chave pública para o SDK de cartão; o servidor
valida os pedidos persistidos e calcula o valor a cobrar, sem confiar no total
enviado pelo navegador. Use credenciais de teste correspondentes ao validar o
fluxo em sandbox.

A expiração automática precisa de um agendador externo. Configure `CRON_SECRET`
no servidor e chame periodicamente `GET /orders/cron/expire-pending-payments`
com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. A rota não é agendada pelo
servidor; em hospedagens com cron limitado, use um agendador externo compatível.
Mantenha `CRON_SECRET` fora do controle de versão e configure o mesmo valor no
agendador usado para chamar a rota.

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Comando adicional:

```bash
npm start
```

`npm start` compila o TypeScript e inicia o aplicativo. Durante o desenvolvimento, `npm run dev` executa o ponto de entrada TypeScript com Nodemon.

## Aplicações relacionadas

- [Meu Delivery — Aplicativo para o cliente](https://meu-delivery-eight.vercel.app/)
- [Meu Delivery Provedor — Painel da loja](https://meu-delivery-provedor.vercel.app/)
- [SaaS Dashboard — Painel SaaS](https://saa-s-dashboard-eta.vercel.app/)
- [Meu Delivery Server — Documentação da API](https://meu-delivery-server-tau.vercel.app/api-docs/)
- [Portfolio](https://meu-porfolio-two.vercel.app/)
