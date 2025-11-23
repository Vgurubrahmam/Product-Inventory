import 'dotenv/config';
import express from 'express';
import productsRouter from './routes/products.js';
import { seedIfEmpty, dbInfo, getDb, isDynamicDb } from './db.js';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
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

app.get('/', (req, res) => res.send({ ok: true }));

async function start() {
  // ensure DB is initialized and seeded
  await seedIfEmpty();
  const info = dbInfo();
  console.log(`Backend starting on http://localhost:${PORT}`);
  console.log(`DB Path: ${info.path}`);
  console.log(`DB Mode: ${info.dynamic ? 'dynamic/in-memory' : 'file-based/static'}`);

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
