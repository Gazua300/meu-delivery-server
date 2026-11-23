import { Router } from "express";
import OrderController from "../controller/OrderController";
import OrderBusiness from "../business/OrderBusiness";
import OrderData from "../data/OrderData";
import Services from "../services/Authentication";
import PaymentData from "../data/PaymentData";

export const orderRouter = Router();

// Instantiating dependencies
const services = new Services();
const orderData = new OrderData();
const paymentData = new PaymentData();
const orderBusiness = new OrderBusiness(orderData, services, paymentData);
const orderController = new OrderController(orderBusiness, services);

// ==========================================
// Order Processing & Status Operations
// ==========================================

orderRouter.post("/", orderController.createOrder);

/**
 * @openapi
 * /orders/active:
 *   get:
 *     summary: Buscar os pedidos ativos solicitados pelo cliente
 *     tags:
 *       - Pedidos
 *     security:
 *       - CustomAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos ativos.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Você ainda não realizou nenhum pedido ativo.
 */
orderRouter.get("/active", orderController.getActiveOrders);
orderRouter.get("/history", orderController.getFinishedOrders);

/**
 * @openapi
 * /orders/all:
 *   get:
 *     summary: Buscar todos os pedidos do estabelecimento autenticado
 *     tags:
 *       - Pedidos
 *     security:
 *       - MerchantAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos do estabelecimento.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       401:
 *         description: Não autorizado - Token do estabelecimento ausente ou inválido.
 *       404:
 *         description: A lista de pedidos está vazia.
 */
orderRouter.get("/all", orderController.getAllOrders);
orderRouter.get("/archived", orderController.getArchivedOrders);
orderRouter.get("/paid", orderController.getPaidOrders);
orderRouter.get("/recent", orderController.getRecentOrders);
orderRouter.get("/by-month", orderController.ordersByMonth);
orderRouter.get("/user/:id", orderController.getActiveOrdersByUserId);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Buscar os dados de um pedido específico pelo ID
 *     tags:
 *       - Pedidos
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID do pedido
 *     responses:
 *       200:
 *         description: Dados do pedido obtidos com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Pedido não encontrado.
 */
orderRouter.get("/:id", orderController.getOrderById);

// Order modifications & actions

/**
 * @openapi
 * /orders/{id}/quantity:
 *   patch:
 *     summary: Atualizar a quantidade de itens de um pedido
 *     tags:
 *       - Pedidos
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID do pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 3
 *     responses:
 *       200:
 *         description: Quantidade atualizada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Quantidade do pedido atualizada com sucesso.
 *       400:
 *         description: Valor de quantidade inválido.
 */
orderRouter.patch("/:id/quantity", orderController.updateOrderQuantity);
/**
 * @openapi
 * /orders/{id}/finish:
 *   patch:
 *     summary: Marcar o pedido como concluído pelo estabelecimento
 *     tags:
 *       - Pedidos
 *     security:
 *       - MerchantAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID do pedido
 *     responses:
 *       200:
 *         description: Pedido marcado como concluído.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Status do pedido atualizado para concluído.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Pedido não encontrado.
 */
orderRouter.patch("/:id/finish", orderController.markOrderAsFinished);

/**
 * @openapi
 * /orders/{id}/revert:
 *   patch:
 *     summary: Reverter o status do pedido para solicitado pelo estabelecimento
 *     tags:
 *       - Pedidos
 *     security:
 *       - MerchantAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID do pedido
 *     responses:
 *       200:
 *         description: Status do pedido revertido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Status do pedido revertido para solicitado.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Pedido não encontrado.
 */
orderRouter.patch("/:id/revert", orderController.revertOrderToRequested);

// Deletions & cleanups
orderRouter.delete("/history", orderController.clearOrderHistory);
//orderRouter.delete("/provider/:id", orderController.clearRequestedOrders);

orderRouter.delete("/:id", orderController.deleteOrder);

// Payments integration
orderRouter.post("/payment", orderController.processPayment);
orderRouter.post("/payment/:id/cancel", orderController.cancelPayment);
orderRouter.get("/payment/:id/status", orderController.getPaymentStatus);
orderRouter.get("/payment/pending", orderController.getPendingPayment);
orderRouter.get("/cron/expire-pending-payments", orderController.reconcileExpiredPendingPayments);