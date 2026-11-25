import { Router } from "express";
import UserController from "../controller/UserController";
import UserBusiness from "../business/UserBusiness";
import UserData from "../data/UserData";
import Services from "../services/Authentication";
import TokenService from "../services/TokenService";
import EmailService from "../services/EmailService";
import { /* requireSignupEnabled, */ requireDeleteAccountEnabled } from "../middleware/signupGate";

export const userRouter = Router();

// Dependency Injection Setup
const services = new Services();
const userData = new UserData();
const tokenService = new TokenService();
const emailService = new EmailService();
const userBusiness = new UserBusiness(userData, services, tokenService, emailService);
const userController = new UserController(userBusiness, services);

// ==========================================
// Authentication & Password Routes
// ==========================================
userRouter.post("/signup", userController.signup);

/**
 * @openapi
 * /users/login:
 *   post:
 *     summary: Autenticar cliente e emitir token JWT
 *     tags:
 *       - Usuários
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: visitor1@email.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login realizado com sucesso. Retorna a string do token JWT bruto.
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Campos ausentes ou formato de e-mail inválido.
 *       401:
 *         description: Senha ou e-mail inválidos.
 */
userRouter.post("/login", userController.login);


userRouter.post("/password/reset-request", userController.requestPasswordReset);

// ==========================================
// Profile & Account Routes
// ==========================================

/**
 * @openapi
 * /users:
 *   get:
 *     summary: Buscar todos os clientes que fizeram pedidos com o estabelecimento autenticado
 *     tags:
 *       - Usuários
 *     security:
 *       - MerchantAuth: []
 *     responses:
 *       200:
 *         description: Lista de clientes associados ao estabelecimento obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "a81f3b20-1e23-4c56-8a90-123456789abc"
 *                   username:
 *                     type: string
 *                     example: Visitor One
 *                   email:
 *                     type: string
 *                     example: visitor@email.com
 *                   phone:
 *                     type: string
 *                     example: "71998887766"
 *       401:
 *         description: Não autorizado - Token do estabelecimento obrigatório.
 *       404:
 *         description: Perfil dos usuários não encontrado.
 */
userRouter.get("/", userController.getAllUsers);

/**
 * @openapi
 * /users/profile:
 *   get:
 *     summary: Buscar os dados do perfil do cliente autenticado
 *     tags:
 *       - Usuários
 *     security:
 *       - CustomAuth: []
 *     responses:
 *       200:
 *         description: Dados do perfil do cliente obtidos com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "a81f3b20-1e23-4c56-8a90-123456789abc"
 *                 username:
 *                   type: string
 *                   example: Visitor ONe
 *                 email:
 *                   type: string
 *                   example: visitor1@email.com
 *                 phone:
 *                   type: string
 *                   example: "71998887766"
 *                 street:
 *                   type: string
 *                   nullable: true
 *                   example: "Av. Sete de Setembro"
 *                 cep:
 *                   type: string
 *                   nullable: true
 *                   example: "40000000"
 *                 number:
 *                   type: string
 *                   nullable: true
 *                   example: "100"
 *                 neighbourhood:
 *                   type: string
 *                   nullable: true
 *                   example: "Barra"
 *                 city:
 *                   type: string
 *                   nullable: true
 *                   example: "Salvador"
 *                 state:
 *                   type: string
 *                   nullable: true
 *                   example: "BA"
 *                 complement:
 *                   type: string
 *                   nullable: true
 *                   example: "Apt 201"
 *       401:
 *         description: Não autorizado - Token inválido ou ausente.
 *       404:
 *         description: Perfil do usuário não encontrado.
 */
userRouter.get("/profile", userController.getProfile);


userRouter.get("/profile/:id", userController.getProfileByUser);

/**
 * @openapi
 * /users/profile:
 *   put:
 *     summary: Atualizar os dados básicos do perfil do cliente
 *     tags:
 *       - Usuários
 *     security:
 *       - CustomAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - phone
 *             properties:
 *               username:
 *                 type: string
 *                 example: Visitor One
 *               email:
 *                 type: string
 *                 format: email
 *                 example: visitor1@email.com
 *               phone:
 *                 type: string
 *                 example: "71998887766"
 *     responses:
 *       200:
 *         description: Perfil do usuário atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Perfil do usuário atualizado com sucesso
 *       400:
 *         description: Campos obrigatórios do perfil não informados.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Usuário não encontrado.
 */

userRouter.put("/profile", userController.updateUser);

/**
 * @openapi
 * /users/address:
 *   put:
 *     summary: Cadastrar ou atualizar o endereço de entrega do cliente
 *     tags:
 *       - Usuários
 *     security:
 *       - CustomAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - street
 *               - cep
 *               - neighbourhood
 *               - city
 *               - state
 *             properties:
 *               street:
 *                 type: string
 *                 example: Largo do Pelourinho
 *               cep:
 *                 type: string
 *                 example: "40026280"
 *               neighbourhood:
 *                 type: string
 *                 example: Centro Histórico
 *               city:
 *                 type: string
 *                 example: Salvador
 *               state:
 *                 type: string
 *                 example: BA
 *               number:
 *                 type: string
 *                 example: "100"
 *                 description: Obrigatório quando o complemento não for informado
 *               complement:
 *                 type: string
 *                 example: Near to Praça da Sé
 *                 description: Obrigatório quando o número não for informado
 *     responses:
 *       200:
 *         description: Endereço cadastrado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Endereço cadastrado com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes ou número e complemento não informados.
 *       401:
 *         description: Não autorizado.
 */
userRouter.put("/address", userController.registerAddress);

userRouter.patch("/password/update", userController.updatePassword);

userRouter.delete("/account", requireDeleteAccountEnabled("ENABLE_CUSTOMER_DELETE"), userController.deleteUser);