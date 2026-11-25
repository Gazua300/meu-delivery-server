import StatisticsData, { Statistics } from "../data/StatisticsData"
import { AppError } from "../services/Authentication"
import { MonthlyStatistic } from "../data/StatisticsData"



export default class StatisticBusiness{
    constructor(
        private statisticsData:StatisticsData
    ){}


    public getStatistics = async(providerId:string):Promise<Statistics[]>=>{
        const restStatistics = await this.statisticsData.getStatisticsPanel(providerId)
        
        if(restStatistics.length === 0){
            throw new AppError(404, 'Não há dados disponíveis para exibir as estatísticas')
        }

        return restStatistics
    }


    public getMonthlyStatistics = async(providerId:string):Promise<MonthlyStatistic[]>=>{
        const revenueByMonth = await this.statisticsData.getMonthlyStatistics(providerId)
        
        if(revenueByMonth.length === 0){
            throw new AppError(401, 'Não há dados disponíveis para exibir as estatísticas mensais')
        }

        return revenueByMonth
    }


    public statisticsPanelForAnalizes = async(providerId:string):Promise<Statistics[]>=>{
        const growthPercentage = await this.statisticsData.statisticsPanelForAnalizes(providerId)
        
        if(growthPercentage.length === 0){
            throw new AppError(401, 'Não há dados disponíveis para exibir a porcentagem de crescimento das estatísticas')
        }

        return growthPercentage
    }
}