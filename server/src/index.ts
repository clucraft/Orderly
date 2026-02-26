import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { initDb } from './db.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'

const app = express()
const port = parseInt(process.env.PORT || '3001', 10)

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', healthRouter)
app.use('/api/auth', authRouter)

// Start server
async function start() {
  await initDb()
  app.listen(port, () => {
    console.log(`Orderly API running on port ${port}`)
  })
}

start().catch(console.error)
