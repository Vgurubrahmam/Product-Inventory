# Database Migration Guide - SQLite to Production Database

## Problem with SQLite in Deployment

**SQLite limitations in production:**
- ❌ Not suitable for cloud deployments with ephemeral storage (Render free tier)
- ❌ File gets deleted when server restarts on free hosting
- ❌ Cannot scale horizontally (multiple server instances)
- ❌ No built-in backups or replication

---

## Solution 1: Use Railway (Easiest - Keeps SQLite)

Railway provides **persistent disk storage** even on free tier, so SQLite works perfectly.

### Steps:
1. Go to [railway.app](https://railway.app)
2. Deploy from GitHub (Backend folder)
3. Your SQLite database will persist across restarts ✅
4. **No code changes needed!**

**Pros:**
- Zero code changes
- Free persistent storage
- Simple deployment

**Cons:**
- Limited to single instance
- No automatic backups

---

## Solution 2: Migrate to PostgreSQL (Recommended for Production)

PostgreSQL is industry-standard for production web apps.

### Option A: Use Supabase (Free PostgreSQL)

#### 1. Setup Supabase

```bash
# Sign up at https://supabase.com
# Create new project
# Copy your database connection string
```

#### 2. Install PostgreSQL Driver

```powershell
cd Backend
npm install pg
```

#### 3. Update `Backend/db.js`

Replace entire file with:

```javascript
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

let _initialized = false;

export async function getDb() {
  if (!_initialized) {
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
    `);
    _initialized = true;
    console.log('PostgreSQL DB initialized');
  }
  return pool;
}

export function isDynamicDb() {
  return false; // PostgreSQL is always persistent
}

export function dbInfo() {
  return {
    path: process.env.DATABASE_URL?.split('@')[1] || 'PostgreSQL',
    dynamic: false,
  };
}

export async function seedIfEmpty() {
  const db = await getDb();
  const result = await db.query('SELECT COUNT(1) as count FROM products');
  if (result.rows[0].count === '0') {
    const sample = [
      ['Apple iPhone 15', 'pcs', 'Electronics', 'Apple', 10, 'In Stock', ''],
      ['Bananas', 'kg', 'Groceries', 'Dole', 0, 'Out of Stock', ''],
      ['Nike Shoes', 'pair', 'Footwear', 'Nike', 5, 'In Stock', '']
    ];
    for (const p of sample) {
      await db.query(
        'INSERT INTO products (name,unit,category,brand,stock,status,image) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        p
      );
    }
    console.log('Seeded sample products into DB');
  }
}

export default { getDb, seedIfEmpty, dbInfo, isDynamicDb };
```

#### 4. Update `Backend/routes/products.js`

Replace all `db.all()`, `db.get()`, `db.run()` with PostgreSQL queries:

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
  const db = await getDb();
  const result = await db.query('SELECT * FROM products ORDER BY id DESC');
  res.json(result.rows);
});

router.get('/search', async (req, res) => {
  const q = req.query.name || '';
  const db = await getDb();
  const result = await db.query(
    'SELECT * FROM products WHERE LOWER(name) LIKE $1 ORDER BY id DESC',
    [`%${q.toLowerCase()}%`]
  );
  res.json(result.rows);
});

router.get('/:id/history', async (req, res) => {
  const id = req.params.id;
  const db = await getDb();
  const result = await db.query(
    'SELECT * FROM inventory_logs WHERE "productId" = $1 ORDER BY timestamp DESC',
    [id]
  );
  res.json(result.rows);
});

router.put('/:id', express.json(), async (req, res) => {
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
    'SELECT id FROM products WHERE LOWER(name)=$1 AND id<>$2',
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
  const product = productResult.rows[0];
  const oldStock = product.stock;

  await db.query(
    `UPDATE products SET name=$1, unit=$2, category=$3, brand=$4, stock=$5, status=$6, image=$7, "updatedAt"=CURRENT_TIMESTAMP WHERE id=$8`,
    [name, unit, category, brand, parsedStock, status, image, id]
  );

  if (oldStock !== parsedStock) {
    await db.query(
      'INSERT INTO inventory_logs ("productId", "oldStock", "newStock", "changedBy") VALUES ($1,$2,$3,$4)',
      [id, oldStock, parsedStock, changedBy || 'admin']
    );
  }

  const updated = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  res.json(updated.rows[0]);
});

router.post('/', express.json(), async (req, res) => {
  const { name, unit, category, brand, stock, status, image, changedBy } = req.body;
  
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const parsedStock = Number(stock) || 0;
  if (parsedStock < 0) {
    return res.status(400).json({ error: 'Stock must be >= 0' });
  }
  
  const db = await getDb();
  
  const existing = await db.query('SELECT id FROM products WHERE LOWER(name)=$1', [name.toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'Product name already exists' });
  }

  const result = await db.query(
    'INSERT INTO products (name,unit,category,brand,stock,status,image) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, unit, category, brand, parsedStock, status || (parsedStock > 0 ? 'In Stock' : 'Out of Stock'), image || '']
  );
  
  const created = result.rows[0];
  
  if (parsedStock > 0) {
    await db.query(
      'INSERT INTO inventory_logs ("productId", "oldStock", "newStock", "changedBy") VALUES ($1,$2,$3,$4)',
      [created.id, 0, parsedStock, changedBy || 'admin']
    );
  }
  
  res.status(201).json(created);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const db = await getDb();
  await db.query('DELETE FROM inventory_logs WHERE "productId" = $1', [id]);
  await db.query('DELETE FROM products WHERE id = $1', [id]);
  res.json({ deleted: id });
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const filePath = req.file.path;
  const results = [];
  const duplicates = [];
  const db = await getDb();

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      let added = 0;
      let skipped = 0;
      
      for (const row of results) {
        const name = (row.name || '').trim();
        if (!name) { skipped++; continue; }
        
        const unit = row.unit || '';
        const category = row.category || '';
        const brand = row.brand || '';
        const stock = Number(row.stock) || 0;
        const status = row.status || (stock > 0 ? 'In Stock' : 'Out of Stock');
        const image = row.image || '';

        const existingResult = await db.query(
          'SELECT id FROM products WHERE LOWER(name)=$1',
          [name.toLowerCase()]
        );
        
        if (existingResult.rows.length > 0) {
          duplicates.push({ name, existingId: existingResult.rows[0].id });
          skipped++;
          continue;
        }

        await db.query(
          'INSERT INTO products (name,unit,category,brand,stock,status,image) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [name, unit, category, brand, stock, status, image]
        );
        added++;
      }

      fs.unlink(filePath, () => {});
      res.json({ added, skipped, duplicates });
    });
});

router.get('/export', async (req, res) => {
  const db = await getDb();
  const result = await db.query('SELECT name,unit,category,brand,stock,status,image FROM products ORDER BY id');
  const fields = ['name', 'unit', 'category', 'brand', 'stock', 'status', 'image'];
  const parser = new Json2CsvParser({ fields });
  const csvData = parser.parse(result.rows);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
  res.send(csvData);
});

export default router;
```

#### 5. Update `Backend/package.json`

```json
{
  "dependencies": {
    "csv-parser": "^3.0.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "json2csv": "^5.0.7",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3"
  }
}
```

#### 6. Set Environment Variable

On Render/Railway/Vercel:
```
DATABASE_URL=postgresql://user:password@host:5432/database
```

Get this from Supabase dashboard under Settings → Database → Connection String

---

## Solution 3: Use Render PostgreSQL (Paid)

Render offers managed PostgreSQL ($7/month):

1. Create PostgreSQL database on Render
2. Follow same migration steps as Solution 2
3. Use Render's internal DATABASE_URL

---

## Solution 4: Keep SQLite with Render Persistent Disk (Paid)

Upgrade to Render paid plan ($7/month) for persistent disk:

1. Upgrade to Render Standard plan
2. No code changes needed
3. SQLite file persists ✅

---

## Comparison Table

| Solution | Cost | Complexity | Scalability | Backups |
|----------|------|------------|-------------|---------|
| Railway + SQLite | Free | ⭐ Easy | Low | Manual |
| Supabase PostgreSQL | Free | ⭐⭐ Medium | High | Auto ✅ |
| Render PostgreSQL | $7/mo | ⭐⭐ Medium | High | Auto ✅ |
| Render Persistent Disk | $7/mo | ⭐ Easy | Low | Manual |

---

## Recommended Choice

**For Learning/Testing:** Railway with SQLite (free, easy)

**For Production:** Supabase PostgreSQL (free, scalable, automatic backups)

---

## Database Backup Strategy (SQLite)

If staying with SQLite on Railway:

```powershell
# Manual backup script
scp user@railway-host:/path/to/backend.sqlite ./backup-$(date +%Y%m%d).sqlite
```

Or use Railway's snapshot feature (paid plan).

---

## Migration Checklist

- [ ] Choose database solution
- [ ] Update db.js with new driver
- [ ] Update routes/products.js with new query syntax
- [ ] Install new dependencies
- [ ] Set DATABASE_URL environment variable
- [ ] Test locally before deploying
- [ ] Deploy and verify data persistence
- [ ] Setup automated backups (if production)
