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
