import multer from "multer"
import { resolve } from 'path'
import { Request, Response, NextFunction } from "express"
import fs from 'fs'

/* ================================= THAT'S FOR USE IN THE LOCALHOST =============================== */

const path1 = resolve(__dirname, '..', '..', '..', 'meu-delivery-provider', 'public', 'imgs', 'products')
const path2 = resolve(__dirname, '..', '..', '..', 'meu-delivery', 'public', 'imgs', 'products')

const storage = multer.diskStorage({
    destination: (req, file, cb)=>{
        cb(null, path1)
    },
    filename: (req, file, cb)=>{

        cb(null, file.originalname)
    }
})


export const replicateUpload = (req:Request, res:Response, next:NextFunction)=>{
    if(!req.file) return next()

    const filename = req.file.filename
    const sourceFile = resolve(path1, filename)
    const destFile2 = resolve(path2, filename)

    try{
        if(!fs.existsSync(path2)) fs.mkdirSync(path2, { recursive: true })
        fs.copyFileSync(sourceFile, destFile2)

        next()
    }catch(e){
        console.error('Um erro ocorreu ao dupublicar o arquivo: ', e)
        res.status(500).json({ e: 'Erro ao duplicar arquivo no sistema'})
    }
}


export const uploadLocal = multer({ storage })