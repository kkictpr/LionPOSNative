import uuid from 'react-native-uuid';
import { getDB } from './database';

const newId = () => uuid.v4() as string;

async function enqueueSync(
  db: any,
  tableName: string,
  recordId: string,
  action: 'upsert' | 'delete',
  payload: any,
) {
  await db.executeSql(
    `INSERT INTO sync_queue (id, table_name, record_id, action, payload)
     VALUES (?,?,?,?,?);`,
    [newId(), tableName, recordId, action, JSON.stringify(payload)],
  );
}

// ---------------- Categories ----------------
export async function listCategories() {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM categories ORDER BY name;`);
  return rows(res);
}

export async function upsertCategory(c: { id?: string; name: string; color?: string }) {
  const db = await getDB();
  const id = c.id ?? newId();
  await db.executeSql(
    `INSERT INTO categories (id, name, color) VALUES (?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color;`,
    [id, c.name, c.color ?? '#6B7280'],
  );
  return id;
}

// ---------------- Products ----------------
export async function listProducts(storeId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT p.*, IFNULL(s.quantity, 0) as quantity, c.name as category_name
     FROM products p
     LEFT JOIN stock s ON s.product_id = p.id AND s.store_id = ?
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1
     ORDER BY p.name;`,
    [storeId],
  );
  return rows(res);
}

export async function upsertProduct(p: {
  id?: string; name: string; sku?: string; barcode?: string;
  category_id?: string; price: number; cost?: number; track_stock?: boolean; image_uri?: string;
}) {
  const db = await getDB();
  const id = p.id ?? newId();
  await db.executeSql(
    `INSERT INTO products (id, name, sku, barcode, category_id, price, cost, track_stock, image_uri)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, sku=excluded.sku, barcode=excluded.barcode,
       category_id=excluded.category_id, price=excluded.price, cost=excluded.cost,
       track_stock=excluded.track_stock, image_uri=excluded.image_uri;`,
    [id, p.name, p.sku ?? null, p.barcode ?? null, p.category_id ?? null,
     p.price, p.cost ?? 0, p.track_stock === false ? 0 : 1, p.image_uri ?? null],
  );
  return id;
}

export async function deactivateProduct(id: string) {
  const db = await getDB();
  await db.executeSql(`UPDATE products SET active = 0 WHERE id = ?;`, [id]);
}

export async function deleteProduct(id: string) {
  return deactivateProduct(id);
}

// ---------------- Variants ----------------
export async function listVariants(productId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM variants WHERE product_id = ? ORDER BY name;`, [productId]);
  return rows(res);
}

export async function upsertVariant(v: { id?: string; product_id: string; name: string; price?: number; sku?: string }) {
  const db = await getDB();
  const id = v.id ?? newId();
  await db.executeSql(
    `INSERT INTO variants (id, product_id, name, price, sku) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price, sku=excluded.sku;`,
    [id, v.product_id, v.name, v.price ?? null, v.sku ?? null],
  );
  return id;
}

export async function deleteVariant(id: string) {
  const db = await getDB();
  await db.executeSql(`DELETE FROM variants WHERE id = ?;`, [id]);
}

// ---------------- Stock ----------------
export async function adjustStock(
  productId: string, storeId: string, change: number,
  reason: 'sale' | 'restock' | 'adjustment' | 'transfer', note?: string,
) {
  const db = await getDB();
  await db.executeSql(
    `INSERT INTO stock (product_id, store_id, quantity) VALUES (?,?,?)
     ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = quantity + ?;`,
    [productId, storeId, change, change],
  );
  await db.executeSql(
    `INSERT INTO stock_movements (id, product_id, store_id, change, reason, note)
     VALUES (?,?,?,?,?,?);`,
    [newId(), productId, storeId, change, reason, note ?? null],
  );
}

export async function lowStockProducts(storeId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT p.name, s.quantity, s.low_stock_alert
     FROM stock s JOIN products p ON p.id = s.product_id
     WHERE s.store_id = ? AND s.low_stock_alert > 0 AND s.quantity <= s.low_stock_alert;`,
    [storeId],
  );
  return rows(res);
}

// ---------------- Employees ----------------
export async function listEmployees(storeId?: string) {
  const db = await getDB();
  const [res] = storeId
    ? await db.executeSql(`SELECT * FROM employees WHERE store_id = ? AND active = 1 ORDER BY name;`, [storeId])
    : await db.executeSql(`SELECT * FROM employees WHERE active = 1 ORDER BY name;`);
  return rows(res);
}

export async function findEmployeeByPin(pin: string) {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM employees WHERE pin = ? AND active = 1;`, [pin]);
  return res.rows.length ? res.rows.item(0) : null;
}

export async function upsertEmployee(e: {
  id?: string; name: string; pin: string; role: string; store_id: string;
}) {
  const db = await getDB();
  const id = e.id ?? newId();
  await db.executeSql(
    `INSERT INTO employees (id, name, pin, role, store_id) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, pin=excluded.pin,
       role=excluded.role, store_id=excluded.store_id;`,
    [id, e.name, e.pin, e.role, e.store_id],
  );
  return id;
}

// ---------------- Customers ----------------
export async function listCustomers() {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM customers ORDER BY name;`);
  return rows(res);
}

export async function upsertCustomer(c: {
  id?: string; name: string; phone?: string; email?: string;
}) {
  const db = await getDB();
  const id = c.id ?? newId();
  await db.executeSql(
    `INSERT INTO customers (id, name, phone, email) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, email=excluded.email;`,
    [id, c.name, c.phone ?? null, c.email ?? null],
  );
  return id;
}

export async function addLoyaltyPoints(customerId: string, points: number) {
  const db = await getDB();
  await db.executeSql(`UPDATE customers SET points = points + ? WHERE id = ?;`, [points, customerId]);
}

// ---------------- Sale transaction ----------------
// ครอบการขายทั้งก้อนด้วย SQLite transaction เดียว (atomic): สำเร็จครบ = COMMIT, ขั้นไหนพลาด = ROLLBACK แล้ว throw ต่อ
// ทุกฟังก์ชันใช้ connection เดียวกัน (getDB singleton) จึงอยู่ใน transaction นี้อัตโนมัติ
// คิว (mutex) กัน createSale สองตัวซ้อนกัน เพราะ SQLite เริ่ม BEGIN ซ้อนใน connection เดียวกันไม่ได้
let saleTxQueue: Promise<unknown> = Promise.resolve();

function withSaleTransaction<T>(db: any, saleId: string, work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    console.log('[SALE_TX_BEGIN]', saleId);
    await db.executeSql(`BEGIN IMMEDIATE;`);
    try {
      const result = await work();
      await db.executeSql(`COMMIT;`);
      console.log('[SALE_TX_COMMIT]', saleId);
      return result;
    } catch (e) {
      console.log('[SALE_TX_ROLLBACK]', saleId, e);
      try {
        await db.executeSql(`ROLLBACK;`);
      } catch (rollbackErr) {
        console.error('[SALE_TX_ROLLBACK_ERROR]', saleId, rollbackErr);
      }
      throw e;
    }
  };
  const p = saleTxQueue.then(run);
  saleTxQueue = p.catch(() => undefined); // คิวต้องไม่ค้างเมื่อรอบก่อน fail
  return p;
}

// ---------------- Sales ----------------
export type CartLine = {
  product_id: string; variant_id?: string; name: string;
  quantity: number; unit_price: number; line_discount?: number;
};

export async function createSale(params: {
  storeId: string;
  employeeId?: string | null; // deprecated: LionPOS ไม่มีระบบพนักงานแล้ว — ไม่ถูกใช้/ไม่บันทึกลง sales
  customerId?: string; shiftId?: string;
  items: CartLine[]; discount?: number; taxRate?: number; paymentMethod: string;
}) {
  const db = await getDB();
  const id = newId();
  const receiptNo = `R${Date.now()}`;
  const subtotal = params.items.reduce(
    (sum, i) => sum + i.quantity * i.unit_price - (i.line_discount ?? 0), 0,
  );
  const discount = params.discount ?? 0;
  const taxRate = params.taxRate ?? 0;
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * (taxRate / 100);
  const total = taxableAmount + tax;

  await withSaleTransaction(db, id, async () => {
    // 1) INSERT sales
    await db.executeSql(
      `INSERT INTO sales (id, receipt_no, store_id, customer_id, subtotal, discount, tax, total, payment_method, shift_id)
       VALUES (?,?,?,?,?,?,?,?,?,?);`,
      [id, receiptNo, params.storeId, params.customerId ?? null,
       subtotal, discount, tax, total, params.paymentMethod, params.shiftId ?? null],
    );

    for (const item of params.items) {
      const lineTotal = item.quantity * item.unit_price - (item.line_discount ?? 0);
      // 2) INSERT sale_items
      await db.executeSql(
        `INSERT INTO sale_items (id, sale_id, product_id, variant_id, name, quantity, unit_price, line_discount, line_total)
         VALUES (?,?,?,?,?,?,?,?,?);`,
        [newId(), id, item.product_id, item.variant_id ?? null, item.name,
         item.quantity, item.unit_price, item.line_discount ?? 0, lineTotal],
      );
      // 3) adjustStock
      await adjustStock(item.product_id, params.storeId, -item.quantity, 'sale');
    }

    // 4) addLoyaltyPoints
    if (params.customerId) {
      await addLoyaltyPoints(params.customerId, Math.floor(total / 100));
    }

    // 5) enqueueSync
    await enqueueSync(db, 'sales', id, 'upsert', {
      id,
      receipt_no: receiptNo,
      store_id: params.storeId,
      employee_id: null,
      customer_id: params.customerId ?? null,
      subtotal,
      discount,
      tax,
      total,
      payment_method: params.paymentMethod,
      status: 'completed',
    });
  });

  return { id, receiptNo, total };
}

export async function voidSale(saleId: string) {
  const db = await getDB();
  await db.executeSql(`UPDATE sales SET status = 'void' WHERE id = ?;`, [saleId]);
}

// Full refund: restocks every item and marks the sale as refunded.
export async function refundSale(saleId: string) {
  const db = await getDB();
  const [s] = await db.executeSql(`SELECT * FROM sales WHERE id = ?;`, [saleId]);
  if (!s.rows.length) return;
  const sale = s.rows.item(0);
  if (sale.status !== 'completed') return; // already void/refunded
  const [items] = await db.executeSql(`SELECT * FROM sale_items WHERE sale_id = ?;`, [saleId]);
  for (let i = 0; i < items.rows.length; i++) {
    const item = items.rows.item(i);
    await adjustStock(item.product_id, sale.store_id, item.quantity, 'adjustment', `refund ${sale.receipt_no}`);
  }
  await db.executeSql(`UPDATE sales SET status = 'refunded' WHERE id = ?;`, [saleId]);
}

export async function saleWithItems(saleId: string) {
  const db = await getDB();
  const [s] = await db.executeSql(`SELECT * FROM sales WHERE id = ?;`, [saleId]);
  const [items] = await db.executeSql(`SELECT * FROM sale_items WHERE sale_id = ?;`, [saleId]);
  return { sale: s.rows.item(0), items: rows(items) };
}

export async function listSales(storeId: string, limit = 50) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT s.*, e.name as employee_name FROM sales s
     LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.store_id = ? ORDER BY s.created_at DESC LIMIT ?;`,
    [storeId, limit],
  );
  return rows(res);
}

// ---------------- Reports ----------------
export async function salesSummary(storeId: string, fromISO: string, toISO: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT COUNT(*) as order_count, IFNULL(SUM(total),0) as revenue, IFNULL(SUM(discount),0) as discounts
     FROM sales
     WHERE store_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?;`,
    [storeId, fromISO, toISO],
  );
  return res.rows.item(0);
}

export async function topProducts(storeId: string, fromISO: string, toISO: string, limit = 10) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT si.name, SUM(si.quantity) as qty, SUM(si.line_total) as revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.store_id = ? AND s.status = 'completed' AND s.created_at BETWEEN ? AND ?
     GROUP BY si.product_id
     ORDER BY revenue DESC
     LIMIT ?;`,
    [storeId, fromISO, toISO, limit],
  );
  return rows(res);
}

export async function salesByEmployee(storeId: string, fromISO: string, toISO: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT COALESCE(e.name, 'ไม่ระบุพนักงาน') as name, COUNT(*) as order_count, SUM(s.total) as revenue
     FROM sales s LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.store_id = ? AND s.status = 'completed' AND s.created_at BETWEEN ? AND ?
     GROUP BY s.employee_id
     ORDER BY revenue DESC;`,
    [storeId, fromISO, toISO],
  );
  return rows(res);
}

// ---------------- Stores ----------------
export async function listStores() {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM stores ORDER BY name;`);
  return rows(res);
}

export async function getStore(id: string) {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM stores WHERE id = ?;`, [id]);
  return res.rows.length ? res.rows.item(0) : null;
}

export async function upsertStore(s: { id?: string; name: string; address?: string; phone?: string }) {
  const db = await getDB();
  const id = s.id ?? newId();
  await db.executeSql(
    `INSERT INTO stores (id, name, address, phone) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address, phone=excluded.phone;`,
    [id, s.name, s.address ?? null, s.phone ?? null],
  );
  return id;
}

// ---------------- Tables & open tickets (restaurant mode) ----------------
export async function listTables(storeId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM tables WHERE store_id = ? ORDER BY name;`, [storeId]);
  return rows(res);
}

export async function upsertTable(t: { id?: string; store_id: string; name: string }) {
  const db = await getDB();
  const id = t.id ?? newId();
  await db.executeSql(
    `INSERT INTO tables (id, store_id, name) VALUES (?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name;`,
    [id, t.store_id, t.name],
  );
  return id;
}

export async function getOpenTicketForTable(tableId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT * FROM sales WHERE table_id = ? AND status = 'open' LIMIT 1;`, [tableId],
  );
  return res.rows.length ? res.rows.item(0) : null;
}

export async function openTicket(params: { storeId: string; employeeId?: string | null; tableId: string }) {
  const db = await getDB();
  const id = newId();
  const receiptNo = `T${Date.now()}`;
  await db.executeSql(
    `INSERT INTO sales (id, receipt_no, store_id, subtotal, total, payment_method, status, table_id)
     VALUES (?,?,?,0,0,'cash','open',?);`,
    [id, receiptNo, params.storeId, params.tableId],
  );
  await db.executeSql(`UPDATE tables SET status = 'occupied' WHERE id = ?;`, [params.tableId]);
  return id;
}

export async function addItemToTicket(saleId: string, item: CartLine) {
  const db = await getDB();
  const lineTotal = item.quantity * item.unit_price - (item.line_discount ?? 0);
  await db.executeSql(
    `INSERT INTO sale_items (id, sale_id, product_id, variant_id, name, quantity, unit_price, line_discount, line_total)
     VALUES (?,?,?,?,?,?,?,?,?);`,
    [newId(), saleId, item.product_id, item.variant_id ?? null, item.name,
     item.quantity, item.unit_price, item.line_discount ?? 0, lineTotal],
  );
}

export async function removeTicketItem(saleItemId: string) {
  const db = await getDB();
  await db.executeSql(`DELETE FROM sale_items WHERE id = ?;`, [saleItemId]);
}

export async function ticketItems(saleId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM sale_items WHERE sale_id = ?;`, [saleId]);
  return rows(res);
}

export async function finalizeTicket(params: {
  saleId: string; tableId: string; storeId: string; shiftId?: string;
  discount?: number; taxRate?: number; paymentMethod: string; customerId?: string;
}) {
  const db = await getDB();
  const items = await ticketItems(params.saleId);
  const subtotal = items.reduce((s: number, i: any) => s + i.line_total, 0);
  const discount = params.discount ?? 0;
  const taxRate = params.taxRate ?? 0;
  const taxable = subtotal - discount;
  const tax = taxable * (taxRate / 100);
  const total = taxable + tax;

  await db.executeSql(
    `UPDATE sales SET subtotal=?, discount=?, tax=?, total=?, status='completed',
       payment_method=?, shift_id=?, customer_id=? WHERE id=?;`,
    [subtotal, discount, tax, total, params.paymentMethod, params.shiftId ?? null, params.customerId ?? null, params.saleId],
  );

  for (const item of items) {
    await adjustStock(item.product_id, params.storeId, -item.quantity, 'sale');
  }
  if (params.customerId) {
    await addLoyaltyPoints(params.customerId, Math.floor(total / 100));
  }
  await db.executeSql(`UPDATE tables SET status = 'available' WHERE id = ?;`, [params.tableId]);

  const [saleRes] = await db.executeSql(`SELECT receipt_no FROM sales WHERE id = ?;`, [params.saleId]);
  return { receiptNo: saleRes.rows.item(0).receipt_no, total };
}

export async function cancelTicket(saleId: string, tableId: string) {
  const db = await getDB();
  await db.executeSql(`DELETE FROM sale_items WHERE sale_id = ?;`, [saleId]);
  await db.executeSql(`DELETE FROM sales WHERE id = ?;`, [saleId]);
  await db.executeSql(`UPDATE tables SET status = 'available' WHERE id = ?;`, [tableId]);
}


export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT value FROM settings WHERE key = ?;`, [key]);
  return res.rows.length ? res.rows.item(0).value : null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDB();
  await db.executeSql(
    `INSERT INTO settings (key, value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value],
  );
}

export async function getAllSettings() {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM settings;`);
  const out: Record<string, string> = {};
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    out[r.key] = r.value;
  }
  return out;
}

// ---------------- Suppliers ----------------
export async function listSuppliers() {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM suppliers ORDER BY name;`);
  return rows(res);
}

export async function upsertSupplier(s: { id?: string; name: string; phone?: string; email?: string; note?: string }) {
  const db = await getDB();
  const id = s.id ?? newId();
  await db.executeSql(
    `INSERT INTO suppliers (id, name, phone, email, note) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, email=excluded.email, note=excluded.note;`,
    [id, s.name, s.phone ?? null, s.email ?? null, s.note ?? null],
  );
  return id;
}

// ---------------- Purchase orders ----------------
export type POLine = { product_id: string; quantity: number; unit_cost: number };

export async function createPurchaseOrder(params: {
  storeId: string; supplierId?: string; items: POLine[]; note?: string;
}) {
  const db = await getDB();
  const id = newId();
  const poNo = `PO${Date.now()}`;
  const totalCost = params.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  await db.executeSql(
    `INSERT INTO purchase_orders (id, po_no, supplier_id, store_id, status, total_cost, note)
     VALUES (?,?,?,?, 'received', ?, ?);`,
    [id, poNo, params.supplierId ?? null, params.storeId, totalCost, params.note ?? null],
  );

  for (const item of params.items) {
    await db.executeSql(
      `INSERT INTO purchase_order_items (id, po_id, product_id, quantity, unit_cost) VALUES (?,?,?,?,?);`,
      [newId(), id, item.product_id, item.quantity, item.unit_cost],
    );
    // receiving immediately updates stock + cost basis
    await adjustStock(item.product_id, params.storeId, item.quantity, 'restock', `PO ${poNo}`);
    await db.executeSql(`UPDATE products SET cost = ? WHERE id = ?;`, [item.unit_cost, item.product_id]);
  }

  return { id, poNo, totalCost };
}

export async function listPurchaseOrders(storeId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT po.*, s.name as supplier_name FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.store_id = ? ORDER BY po.created_at DESC;`,
    [storeId],
  );
  return rows(res);
}

// ---------------- helper ----------------
function rows(res: any) {
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out;
}
