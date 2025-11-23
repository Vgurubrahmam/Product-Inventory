import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import { Parser as Json2CsvParser } from 'json2csv';
import { getDb } from '../db.js';
import path from 'path';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/', async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
});

router.get('/search', async (req, res) => {
  const q = req.query.name || '';
  const db = await getDb();
  const rows = await db.all('SELECT * FROM products WHERE LOWER(name) LIKE ? ORDER BY id DESC', [`%${q.toLowerCase()}%`]);
  res.json(rows);
});

router.get('/:id/history', async (req, res) => {
  const id = req.params.id;
  const db = await getDb();
  const logs = await db.all('SELECT * FROM inventory_logs WHERE productId = ? ORDER BY timestamp DESC', [id]);
  res.json(logs);
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

  // check unique name
  const existing = await db.get('SELECT id FROM products WHERE LOWER(name)=? AND id<>?', [name.toLowerCase(), id]);
  if (existing) {
    return res.status(400).json({ error: 'Product name already exists' });
  }

  // get old stock
  const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const oldStock = product.stock;

  await db.run(
    `UPDATE products SET name=?, unit=?, category=?, brand=?, stock=?, status=?, image=?, updatedAt=datetime('now') WHERE id=?`,
    [name, unit, category, brand, parsedStock, status, image, id]
  );

  if (oldStock !== parsedStock) {
    await db.run(
      'INSERT INTO inventory_logs (productId, oldStock, newStock, changedBy) VALUES (?,?,?,?)',
      [id, oldStock, parsedStock, changedBy || 'admin']
    );
  }

  const updated = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  res.json(updated);
});

router.post('/', express.json(), async (req, res) => {
  const { name, unit, category, brand, stock, status, image, changedBy } = req.body;
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }
  const parsedStock = Number(stock) || 0;
  if (parsedStock < 0) return res.status(400).json({ error: 'Stock must be >= 0' });
  const db = await getDb();
  const existing = await db.get('SELECT id FROM products WHERE LOWER(name)=?', [name.toLowerCase()]);
  if (existing) return res.status(400).json({ error: 'Product name already exists' });

  const result = await db.run('INSERT INTO products (name,unit,category,brand,stock,status,image) VALUES (?,?,?,?,?,?,?)', [name,unit,category,brand,parsedStock,status || (parsedStock>0? 'In Stock':'Out of Stock'), image || '']);
  const id = result.lastID;
  if (parsedStock > 0) {
    await db.run('INSERT INTO inventory_logs (productId, oldStock, newStock, changedBy) VALUES (?,?,?,?)', [id, 0, parsedStock, changedBy || 'admin']);
  }
  const created = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  res.status(201).json(created);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const db = await getDb();
  await db.run('DELETE FROM products WHERE id = ?', [id]);
  await db.run('DELETE FROM inventory_logs WHERE productId = ?', [id]);
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

        const existing = await db.get('SELECT id FROM products WHERE LOWER(name)=?', [name.toLowerCase()]);
        if (existing) {
          duplicates.push({ name, existingId: existing.id });
          skipped++;
          continue;
        }

        await db.run('INSERT INTO products (name,unit,category,brand,stock,status,image) VALUES (?,?,?,?,?,?,?)', [name,unit,category,brand,stock,status,image]);
        added++;
      }

      // delete tmp file
      fs.unlink(filePath, () => {});

      res.json({ added, skipped, duplicates });
    });
});

router.get('/export', async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT name,unit,category,brand,stock,status,image FROM products ORDER BY id');
  const fields = ['name','unit','category','brand','stock','status','image'];
  const parser = new Json2CsvParser({ fields });
  const csv = parser.parse(rows);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
  res.send(csv);
});

export default router;
