import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export type DB = SQLite.SQLiteDatabase;

let dbInstance: DB | null = null;

export async function getDB(): Promise<DB> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabase({
    name: 'lionpos.db',
    location: 'default',
  });
  await migrate(dbInstance);
  return dbInstance;
}

async function migrate(db: DB) {
  await db.executeSql(`PRAGMA foreign_keys = ON;`);

  // ---- Stores (multi-branch) ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ---- Employees ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier', -- owner | manager | cashier
      store_id TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );
  `);

  // ---- Categories ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6B7280'
    );
  `);

  // ---- Products ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      category_id TEXT,
      price REAL NOT NULL DEFAULT 0,
      cost REAL DEFAULT 0,
      track_stock INTEGER DEFAULT 1,
      image_uri TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  // ---- Product variants (e.g. size/color) ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL,
      sku TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // ---- Stock per store ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS stock (
      product_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      low_stock_alert REAL DEFAULT 0,
      PRIMARY KEY (product_id, store_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      change REAL NOT NULL,
      reason TEXT NOT NULL, -- sale | restock | adjustment | transfer
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ---- Customers / loyalty ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      points REAL DEFAULT 0,
      store_credit REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ---- Sales / receipts ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      receipt_no TEXT NOT NULL,
      store_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      customer_id TEXT,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash', -- cash | card | other
      status TEXT NOT NULL DEFAULT 'completed', -- completed | refunded | void
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      line_discount REAL DEFAULT 0,
      line_total REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
  `);

  // ---- App settings (key-value: tax_rate, currency, receipt_footer, etc.) ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // ---- Suppliers ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ---- Purchase orders (formal stock receiving) ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_no TEXT NOT NULL,
      supplier_id TEXT,
      store_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received', -- draft | ordered | received | cancelled
      total_cost REAL DEFAULT 0,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // ---- Shifts (open/close register with cash count) ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      opening_cash REAL NOT NULL DEFAULT 0,
      closing_cash REAL,
      expected_cash REAL,
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT,
      note TEXT,
      FOREIGN KEY (store_id) REFERENCES stores(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );
  `);

  // ---- Tables (restaurant mode) ----
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available', -- available | occupied
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );
  `);

  // add discount_percent / tax_rate columns to sales if migrating from an older version
  await addColumnIfMissing(db, 'sales', 'shift_id', 'TEXT');
  await addColumnIfMissing(db, 'sales', 'table_id', 'TEXT');
  await addColumnIfMissing(db, 'products', 'category_id', 'TEXT');

  // seed a default store + owner PIN if empty
  const [res] = await db.executeSql(`SELECT COUNT(*) as c FROM stores;`);
  if (res.rows.item(0).c === 0) {
    await db.executeSql(
      `INSERT INTO stores (id, name) VALUES ('store-1', 'สาขาหลัก');`,
    );
    await db.executeSql(
      `INSERT INTO employees (id, name, pin, role, store_id) VALUES ('emp-1', 'เจ้าของร้าน', '1234', 'owner', 'store-1');`,
    );
    await db.executeSql(
      `INSERT INTO categories (id, name, color) VALUES ('cat-1', 'ทั่วไป', '#6B7280');`,
    );
  }

  const [settingsRes] = await db.executeSql(`SELECT COUNT(*) as c FROM settings;`);
  if (settingsRes.rows.item(0).c === 0) {
    await db.executeSql(
      `INSERT INTO settings (key, value) VALUES ('tax_rate', '0'), ('currency', 'THB'), ('receipt_footer', 'ขอบคุณที่ใช้บริการ'), ('restaurant_mode', '0');`,
    );
  }
}

async function addColumnIfMissing(db: DB, table: string, column: string, type: string) {
  const [res] = await db.executeSql(`PRAGMA table_info(${table});`);
  const cols: string[] = [];
  for (let i = 0; i < res.rows.length; i++) cols.push(res.rows.item(i).name);
  if (!cols.includes(column)) {
    await db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
  }
}

export async function resetDatabase() {
  const db = await getDB();
  const tables = [
    'sale_items', 'sales', 'stock_movements', 'stock', 'variants',
    'products', 'categories', 'customers', 'employees', 'stores',
  ];
  for (const t of tables) {
    await db.executeSql(`DROP TABLE IF EXISTS ${t};`);
  }
  dbInstance = null;
  await getDB();
}
