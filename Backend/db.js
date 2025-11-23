import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Use env override; ':memory:' will use an in-memory (dynamic) DB
const DB_PATH = process.env.DB_PATH || path.resolve('./backend.sqlite');

let dbInstance = null;
let _initialized = false;

export async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  if (!_initialized) {
    // Initialize schema if not exists
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        unit TEXT,
        category TEXT,
        brand TEXT,
        stock INTEGER DEFAULT 0,
        status TEXT,
        image TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS inventory_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL,
        oldStock INTEGER,
        newStock INTEGER,
        changedBy TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(productId) REFERENCES products(id)
      );
    `);

    _initialized = true;
    console.log(`SQLite DB initialized at: ${DB_PATH} (${isDynamicDb() ? 'in-memory/dynamic' : 'file-based/static'})`);
  }

  return dbInstance;
}

export function isDynamicDb() {
  return DB_PATH === ':memory:';
}

export function dbInfo() {
  return { path: DB_PATH, dynamic: isDynamicDb() };
}

export async function seedIfEmpty() {
  const db = await getDb();
  const row = await db.get('SELECT COUNT(1) as cnt FROM products');
  if (row && row.cnt === 0) {
    const sample = [
      ['Apple iPhone 15', 'pcs', 'Electronics', 'Apple', 10, 'In Stock', ''],
      ['Bananas', 'kg', 'Groceries', 'Dole', 0, 'Out of Stock', ''],
      ['Nike Shoes', 'pair', 'Footwear', 'Nike', 5, 'In Stock', '']
    ];
    const insert = await db.prepare('INSERT INTO products (name,unit,category,brand,stock,status,image) VALUES (?,?,?,?,?,?,?)');
    for (const p of sample) {
      await insert.run(...p);
    }
    await insert.finalize();
    console.log('Seeded sample products into DB');
  }
}

export default { getDb, seedIfEmpty, dbInfo, isDynamicDb };
