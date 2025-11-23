import 'dotenv/config';
import express from 'express';
import productsRouter from './routes/products.js';
import { seedIfEmpty, dbInfo, getDb, isDynamicDb } from './db.js';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8000;

// Configure CORS to allow your frontend domain
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://product-inventory-frontend-beta.vercel.app',
    'https://product-inventory-delta-one.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use('/api/products', productsRouter);

// Status endpoint to report server + DB connection info
app.get('/api/status', async (req, res) => {
  try {
    // ensure DB is opened
    await getDb();
    res.json({
      ok: true,
      server: { port: PORT, pid: process.pid },
      db: dbInfo(),
      dynamicDb: isDynamicDb()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get('/', (req, res) => res.json({ ok: true, message: 'Product Inventory API' }));

// Initialize database on first request (for serverless)
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await getDb();
      console.log('Database initialized');
      dbInitialized = true;
    } catch (err) {
      console.error('DB init error:', err);
    }
  }
  next();
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, async () => {
    try {
      await seedIfEmpty();
      const info = dbInfo();
      console.log(`Backend listening on http://localhost:${PORT}`);
      console.log(`DB: ${info.path}`);
    } catch (err) {
      console.error('Startup error:', err);
    }
  });
}

// Export for Vercel serverless
export default app;
