export default class StockConflictError extends Error {
    constructor(){
        super('Produto não encontrado ou insuficiente no estoque para a quantidade solicitada')
        this.name = 'StockConflictError'
    }
}