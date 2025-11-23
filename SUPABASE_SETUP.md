# Connect to Supabase PostgreSQL - Step by Step Guide

## Step 1: Create Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign up with GitHub (recommended) or email
4. Verify your email

## Step 2: Create New Project

1. Click **"New Project"**
2. Fill in:
   - **Name**: `product-inventory` (or any name)
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to you (e.g., Asia Pacific for India)
   - **Pricing Plan**: Free (no credit card needed)
3. Click **"Create new project"**
4. Wait 2-3 minutes for database setup

## Step 3: Get Connection String

1. In Supabase dashboard, go to **Settings** (gear icon on left sidebar)
2. Click **Database** in the left menu
3. Scroll to **Connection string** section
4. Copy the **Connection string** (URI format):
   ```
   postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```
5. Replace `YOUR_PASSWORD` with the password you created in Step 2

## Step 4: Install PostgreSQL Driver

Open terminal in your Backend folder:

```powershell
cd "c:\Users\vguru\Desktop\internships\Product Inventory Management System\Backend"
npm install pg
```

## Step 5: Create `.env` File

Create `Backend/.env` file:

```env
DATABASE_URL=postgresql://postgres.xxxxx:YOUR_ACTUAL_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
PORT=8000
NODE_ENV=development
```

Replace the DATABASE_URL with your actual connection string from Step 3.

## Step 6: Update `Backend/db.js`

Replace the entire file with this PostgreSQL version:

```javascript
import pkg from 'pg';
const { Pool } = pkg;

// Use environment variable for connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

let _initialized = false;

export async function getDb() {
  if (!_initialized) {
    try {
      // Initialize schema
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          unit TEXT,
          category TEXT,
          brand TEXT,
          stock INTEGER DEFAULT 0,
          status TEXT,
          image TEXT,
          "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_logs (
          id SERIAL PRIMARY KEY,
          "productId" INTEGER NOT NULL,
          "oldStock" INTEGER,
          "newStock" INTEGER,
          "changedBy" TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY("productId") REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_products_name ON products(LOWER(name));
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_product ON inventory_logs("productId");
      `);

      _initialized = true;
      console.log('PostgreSQL DB initialized successfully');
    } catch (err) {
      console.error('Database initialization error:', err);
      throw err;
    }
  }
  return pool;
}

export function isDynamicDb() {
  return false;
}

export function dbInfo() {
  const url = process.env.DATABASE_URL || '';
  const host = url.includes('@') ? url.split('@')[1]?.split('/')[0] : 'PostgreSQL';
  return {
    path: host,
    dynamic: false,
  };
}

export async function seedIfEmpty() {
  try {
    const db = await getDb();
    const result = await db.query('SELECT COUNT(*) as count FROM products');
    const count = parseInt(result.rows[0].count);

    if (count === 0) {
      const sample = [
        ['Apple iPhone 15', 'pcs', 'Electronics', 'Apple', 10, 'In Stock', ''],
        ['Bananas', 'kg', 'Groceries', 'Dole', 0, 'Out of Stock', ''],
        ['Nike Shoes', 'pair', 'Footwear', 'Nike', 5, 'In Stock', '']
      ];

      for (const p of sample) {
        await db.query(
          'INSERT INTO products (name, unit, category, brand, stock, status, image) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          p
        );
      }
      console.log('Seeded 3 sample products');
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
}

export default { getDb, seedIfEmpty, dbInfo, isDynamicDb };
```

## Step 7: Update `Backend/routes/products.js`

Replace with PostgreSQL queries:

```javascript
import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import { Parser as Json2CsvParser } from 'json2csv';
import { getDb } from '../db.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = req.query.name || '';
    const db = await getDb();
    const result = await db.query(
      'SELECT * FROM products WHERE LOWER(name) LIKE $1 ORDER BY id DESC',
      [`%${q.toLowerCase()}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const id = req.params.id;
    const db = await getDb();
    const result = await db.query(
      'SELECT * FROM inventory_logs WHERE "productId" = $1 ORDER BY timestamp DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', express.json(), async (req, res) => {
  try {
    const id = req.params.id;
    const { name, unit, category, brand, stock, status, image, changedBy } = req.body;

    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const parsedStock = Number(stock);
    if (Number.isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: 'Stock must be a number >= 0' });
    }

    const db = await getDb();

    // Check unique name
    const existing = await db.query(
      'SELECT id FROM products WHERE LOWER(name) = $1 AND id != $2',
      [name.toLowerCase(), id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Product name already exists' });
    }

    // Get old stock
    const productResult = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const oldStock = productResult.rows[0].stock;

    await db.query(
      `UPDATE products SET name = $1, unit = $2, category = $3, brand = $4, stock = $5, 
       status = $6, image = $7, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $8`,
      [name, unit, category, brand, parsedStock, status, image, id]
    );

    if (oldStock !== parsedStock) {
      await db.query(
        'INSERT INTO inventory_logs ("productId", "oldStock", "newStock", "changedBy") VALUES ($1, $2, $3, $4)',
        [id, oldStock, parsedStock, changedBy || 'admin']
      );
    }

    const updated = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', express.json(), async (req, res) => {
  try {
    const { name, unit, category, brand, stock, status, image, changedBy } = req.body;

    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const parsedStock = Number(stock) || 0;
    if (parsedStock < 0) {
      return res.status(400).json({ error: 'Stock must be >= 0' });
    }

    const db = await getDb();

    const existing = await db.query('SELECT id FROM products WHERE LOWER(name) = $1', [name.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Product name already exists' });
    }

    const result = await db.query(
      'INSERT INTO products (name, unit, category, brand, stock, status, image) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, unit, category, brand, parsedStock, status || (parsedStock > 0 ? 'In Stock' : 'Out of Stock'), image || '']
    );

    const created = result.rows[0];

    if (parsedStock > 0) {
      await db.query(
        'INSERT INTO inventory_logs ("productId", "oldStock", "newStock", "changedBy") VALUES ($1, $2, $3, $4)',
        [created.id, 0, parsedStock, changedBy || 'admin']
      );
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const db = await getDb();
    await db.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const results = [];
  const duplicates = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const db = await getDb();
        let added = 0;
        let skipped = 0;

        for (const row of results) {
          const name = (row.name || '').trim();
          if (!name) {
            skipped++;
            continue;
          }

          const unit = row.unit || '';
          const category = row.category || '';
          const brand = row.brand || '';
          const stock = Number(row.stock) || 0;
          const status = row.status || (stock > 0 ? 'In Stock' : 'Out of Stock');
          const image = row.image || '';

          const existingResult = await db.query(
            'SELECT id FROM products WHERE LOWER(name) = $1',
            [name.toLowerCase()]
          );

          if (existingResult.rows.length > 0) {
            duplicates.push({ name, existingId: existingResult.rows[0].id });
            skipped++;
            continue;
          }

          await db.query(
            'INSERT INTO products (name, unit, category, brand, stock, status, image) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [name, unit, category, brand, stock, status, image]
          );
          added++;
        }

        fs.unlink(filePath, () => {});
        res.json({ added, skipped, duplicates });
      } catch (err) {
        fs.unlink(filePath, () => {});
        res.status(500).json({ error: err.message });
      }
    });
});

router.get('/export', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.query('SELECT name, unit, category, brand, stock, status, image FROM products ORDER BY id');
    const fields = ['name', 'unit', 'category', 'brand', 'stock', 'status', 'image'];
    const parser = new Json2CsvParser({ fields });
    const csvData = parser.parse(result.rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

## Step 8: Update `Backend/package.json`

Add `dotenv` and ensure `pg` is listed:

```json
{
  "name": "backend",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "csv-parser": "^3.0.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "json2csv": "^5.0.7",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

Install dotenv:
```powershell
npm install dotenv
```

## Step 9: Update `Backend/index.js`

Add dotenv at the top:

```javascript
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

// Status endpoint
app.get('/api/status', async (req, res) => {
  try {
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
  await seedIfEmpty();
  const info = dbInfo();
  console.log(`Backend starting on http://localhost:${PORT}`);
  console.log(`DB: ${info.path}`);
  console.log(`DB Mode: ${info.dynamic ? 'dynamic/in-memory' : 'PostgreSQL (persistent)'}`);

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});
```

## Step 10: Update `.gitignore`

Make sure `.env` is ignored:

```
.env
.env.local
.env.production
```

## Step 11: Test Locally

```powershell
cd Backend
npm install
npm run dev
```

You should see:
```
PostgreSQL DB initialized successfully
Seeded 3 sample products
Backend listening on http://localhost:8000
```

## Step 12: Test the API

Open browser or Postman:
- http://localhost:8000/api/status
- http://localhost:8000/api/products

## Step 13: Deploy to Render/Railway

### For Render:
1. Go to Render dashboard
2. Click your backend service
3. Go to **Environment** tab
4. Add environment variable:
   - Key: `DATABASE_URL`
   - Value: Your Supabase connection string
5. Click **Save Changes**
6. Service will auto-redeploy

### For Railway:
1. Go to Railway dashboard
2. Click your backend service
3. Go to **Variables** tab
4. Add:
   - `DATABASE_URL`: Your Supabase connection string
5. Railway will auto-redeploy

## Step 14: Verify in Supabase

1. Go to Supabase dashboard
2. Click **Table Editor** (left sidebar)
3. You should see:
   - `products` table with 3 sample products
   - `inventory_logs` table

## Troubleshooting

### Error: "Connection timeout"
- Check your connection string is correct
- Ensure password has no special characters (or URL-encode them)
- Check Supabase project is active

### Error: "SSL required"
- Make sure `ssl: { rejectUnauthorized: false }` is in Pool config

### Error: "Cannot find module 'pg'"
- Run: `npm install pg`

### Database not updating
- Check DATABASE_URL in .env file
- Verify connection string from Supabase dashboard
- Check Supabase project status

## Benefits of Supabase PostgreSQL

✅ **Free tier**: Up to 500 MB database  
✅ **Persistent**: Data never deleted  
✅ **Automatic backups**: Daily backups  
✅ **Scalable**: Can handle multiple server instances  
✅ **Real-time**: Optional real-time subscriptions  
✅ **Dashboard**: Easy to view/edit data  

## Next Steps

- ✅ Remove `sqlite3` from dependencies: `npm uninstall sqlite3 sqlite`
- ✅ Delete `backend.sqlite` file if exists
- ✅ Commit changes to GitHub
- ✅ Deploy to Render/Railway with DATABASE_URL env variable
