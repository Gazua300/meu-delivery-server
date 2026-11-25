import { Router } from "express";
import { replicateUpload, uploadLocal } from "../config/duplicateUpload";
import { uploadSignupImage, replicatedSignupUpload } from "../config/singupImage";
import RestaurantController from "../controller/RestaurantController";
import RestaurantBusiness from "../business/RestaurantBusiness";
import RestaurantData from "../data/RestaurantData";
import Services from "../services/Authentication";
import TokenService from "../services/TokenService";
import EmailService from "../services/EmailService";
import { /* requireSignupEnabled, */ requireDeleteAccountEnabled } from "../middleware/signupGate";

export const restaurantRouter = Router();

// Instantiating dependencies
const services = new Services();
const tokenService = new TokenService()
const emailService = new EmailService()
const restaurantData = new RestaurantData();
const restaurantBusiness = new RestaurantBusiness(restaurantData, services, tokenService, emailService);
const restaurantController = new RestaurantController(restaurantBusiness, services);

// ==========================================
// Merchant Restaurant Authentication & Profile
// ==========================================

restaurantRouter.post("/signup", uploadSignupImage.single('image'), replicatedSignupUpload, restaurantController.signupRestaurant);

/**
 * @openapi
 * /providers/login:
 *   post:
 *     summary: Autenticar estabelecimento e emitir token JWT
 *     tags:
 *       - Estabelecimentos
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
 *                 example: admin1@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login realizado com sucesso. Retorna o token JWT bruto do estabelecimento.
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: E-mail ou senha não informados.
 *       401:
 *         description: Credenciais do estabelecimento inválidas.
 */
restaurantRouter.post("/login", restaurantController.loginRestaurant);
restaurantRouter.post("/password/reset-request", restaurantController.requestPasswordReset);

/**
 * @openapi
 * /providers/profile:
 *   get:
 *     summary: Buscar os dados do estabelecimento autenticado
 *     tags:
 *       - Estabelecimentos
 *     security:
 *       - MerchantAuth: []
 *     responses:
 *       200:
 *         description: Dados do perfil do estabelecimento obtidos com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "b92f4c31-2f34-5d67-9b01-234567890def"
 *                 name:
 *                   type: string
 *                   example: Livri
 *                 email:
 *                   type: string
 *                   example: admin1@example.com
 *                 phone:
 *                   type: string
 *                   example: "71999887766"
 *                 address:
 *                   type: string
 *                   example: Largo do Pelourinho
 *                 description:
 *                   type: string
 *                   example: Literary books in your hands and in your home.
 *                 logourl:
 *                   type: string
 *                   nullable: true
 *                   example: https://res.cloudinary.com/demo/image/upload/v1/logo.png
 *       401:
 *         description: Não autorizado - Token do estabelecimento ausente ou inválido.
 *       404:
 *         description: Estabelecimento não encontrado.
 */
restaurantRouter.get("/profile", restaurantController.getRestaurantById);
restaurantRouter.get("/restaurant/:id", restaurantController.getRestaurantByCustomer);


restaurantRouter.get("/", restaurantController.getRestaurants);

// ==========================================
// Product Catalog & Management Operations
// ==========================================

/**
 * @openapi
 * /providers/products:
 *   get:
 *     summary: Buscar a lista de produtos do estabelecimento autenticado
 *     tags:
 *       - Estabelecimentos
 *     security:
 *       - MerchantAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos pertencentes ao estabelecimento obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "p1234567-89ab-cdef-0123-456789abcdef"
 *                   name:
 *                     type: string
 *                     example: Lord of the Rings
 *                   price:
 *                     type: number
 *                     example: 190.00
 *                   category:
 *                     type: string
 *                     example: Fantasy
 *                   description:
 *                     type: string
 *                     example: Published in 1954–1955.
 *                   photoUrl:
 *                     type: string
 *                     example: https://res.cloudinary.com/demo/image/upload/v1/burger.jpg
 *                   provider:
 *                     type: string
 *                     example: "b92f4c31-2f34-5d67-9b01-234567890def"
 *       401:
 *         description: Não autorizado - Token do estabelecimento ausente ou inválido.
 *       404:
 *         description: O cardápio está vazio.
 */
restaurantRouter.get("/products", restaurantController.getAllProducts);
restaurantRouter.get("/clientside-products/:id", restaurantController.aAllProductsByClientSide);

/**
 * @openapi
 * /providers/product/{id}:
 *   get:
 *     summary: Buscar um produto específico pelo ID
 *     tags:
 *       - Estabelecimentos
 *     security:
 *       - MerchantAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID do produto
 *     responses:
 *       200:
 *         description: Dados do produto obtidos com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "p1234567-89ab-cdef-0123-456789abcdef"
 *                 name:
 *                   type: string
 *                   example: Lord of the Rings
 *                 price:
 *                   type: number
 *                   example: 190.00
 *                 category:
 *                   type: string
 *                   example: Fantasy
 *                 description:
 *                   type: string
 *                   example: Published in 1954–1955.
 *                 photoUrl:
 *                   type: string
 *                   example: https://res.cloudinary.com/demo/image/upload/v1/burger.jpg
 *                 provider:
 *                   type: string
 *                   example: "b92f4c31-2f34-5d67-9b01-234567890def"
 *       401:
 *         description: Não autorizado - Token do estabelecimento ausente ou inválido.
 *       404:
 *         description: Produto não encontrado.
 */
restaurantRouter.get("/product/:id", restaurantController.getProductById);
restaurantRouter.post("/product", uploadLocal.single('image'), replicateUpload, restaurantController.insertProduct);
restaurantRouter.put("/product/:id", uploadLocal.single('image'), replicateUpload, restaurantController.updateProduct);

/**
 * @openapi
 * /providers/update:
 *   put:
 *     summary: Atualizar os dados básicos do perfil do estabelecimento
 *     tags:
 *       - Estabelecimentos
 *     security:
 *       - MerchantAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *                 example: Livri
 *               phone:
 *                 type: string
 *                 example: "71999887766"
 *               address:
 *                 type: string
 *                 example: Largo do Pelourinho
 *     responses:
 *       200:
 *         description: Perfil do estabelecimento atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dados do estabelecimento atualizados com sucesso
 *       400:
 *         description: Campos obrigatórios do perfil não informados.
 *       401:
 *         description: Não autorizado - Token do estabelecimento ausente ou inválido.
 */
restaurantRouter.put("/update", restaurantController.updateRestaurant);
restaurantRouter.patch("/password/update", restaurantController.updatePassword);
restaurantRouter.delete("/product/:id", restaurantController.deleteProduct);
restaurantRouter.delete("/account", requireDeleteAccountEnabled("ENABLE_PROVIDER_DELETE"), restaurantController.deleteRestaurantAccount);
