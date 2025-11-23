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
