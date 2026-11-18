// Staff panel API: orders, stock, suppliers, support
const router = require('express').Router();
const pool = require('../db');
const { ah, httpError, requireAdmin } = require('../helpers');
const { FLOW, changeStatus } = require('../orderService');

router.use(requireAdmin);

// run a function inside BEGIN ... COMMIT
async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// GET /api/admin/stats  -> numbers for the dashboard
router.get('/stats', ah(async (req, res) => {
  const byStatus = await pool.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
  const money = await pool.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS revenue,
            COALESCE(SUM(amount) FILTER (WHERE status = 'success' AND paid_at::date = CURRENT_DATE), 0) AS today
       FROM payments`
  );
  const low = await pool.query('SELECT COUNT(*) AS n FROM inventory WHERE qty_on_hand - qty_reserved <= reorder_level');
  const tickets = await pool.query(`SELECT COUNT(*) AS n FROM support_tickets WHERE status IN ('open', 'in_progress')`);
  const top = await pool.query(
    `SELECT p.name, SUM(oi.quantity) AS sold
       FROM order_items oi JOIN orders o USING (order_id) JOIN products p USING (product_id)
      WHERE o.status NOT IN ('cancelled', 'returned')
      GROUP BY p.name ORDER BY sold DESC LIMIT 5`
  );
  res.json({
    orders: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.n])),
    revenue: money.rows[0].revenue,
    revenue_today: money.rows[0].today,
    low_stock: low.rows[0].n,
    open_tickets: tickets.rows[0].n,
    top_products: top.rows,
  });
}));

// GET /api/admin/orders
router.get('/orders', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.order_id, o.order_date, o.status, o.total_amount,
            c.full_name AS customer, c.phone, a.city, a.street,
            pay.method, pay.status AS payment_status, d.tracking_number,
            (SELECT string_agg(p.name || ' x' || oi.quantity, ', ' ORDER BY p.name)
               FROM order_items oi JOIN products p USING (product_id) WHERE oi.order_id = o.order_id) AS items
       FROM orders o
       JOIN customers c USING (customer_id)
       JOIN addresses a USING (address_id)
       LEFT JOIN payments pay ON pay.order_id = o.order_id
       LEFT JOIN deliveries d ON d.order_id = o.order_id
      ORDER BY o.order_date DESC`
  );
  res.json(rows.map((o) => ({ ...o, next: FLOW[o.status] })));
}));

// PATCH /api/admin/orders/:id/status   body: { status, partner_id }
router.patch('/orders/:id/status', ah(async (req, res) => {
  await inTransaction((client) =>
    changeStatus(client, Number(req.params.id), req.body.status, { partnerId: Number(req.body.partner_id) || null })
  );
  res.json({ ok: true });
}));

// GET /api/admin/inventory  -> stock for every product
router.get('/inventory', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.product_id, p.sku, p.name, p.price, s.company_name AS supplier, s.lead_time_days,
            i.qty_on_hand, i.qty_reserved, i.qty_on_hand - i.qty_reserved AS available, i.reorder_level,
            (i.qty_on_hand - i.qty_reserved <= i.reorder_level) AS low,
            (SELECT COALESCE(SUM(quantity), 0) FROM purchase_orders po
              WHERE po.product_id = p.product_id AND po.status IN ('ordered', 'shipped')) AS incoming
       FROM products p JOIN inventory i USING (product_id) JOIN suppliers s USING (supplier_id)
      ORDER BY low DESC, available, p.product_id`
  );
  res.json(rows);
}));

// GET /api/admin/purchase-orders
router.get('/purchase-orders', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT po.*, p.name AS product, s.company_name AS supplier
       FROM purchase_orders po JOIN products p USING (product_id) JOIN suppliers s ON s.supplier_id = po.supplier_id
      ORDER BY po.po_id DESC`
  );
  res.json(rows);
}));

// POST /api/admin/purchase-orders  body: { product_id, quantity }
router.post('/purchase-orders', ah(async (req, res) => {
  const productId = Number(req.body.product_id);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw httpError(400, 'Quantity must be a positive number');
  const { rows } = await pool.query(
    `INSERT INTO purchase_orders (supplier_id, product_id, quantity, expected_at)
     SELECT p.supplier_id, p.product_id, $2, CURRENT_DATE + s.lead_time_days
       FROM products p JOIN suppliers s USING (supplier_id) WHERE p.product_id = $1
     RETURNING *`,
    [productId, quantity]
  );
  if (!rows.length) throw httpError(404, 'Product not found');
  res.status(201).json(rows[0]);
}));

// PATCH /api/admin/purchase-orders/:id/receive  -> goods arrived, add to stock
router.patch('/purchase-orders/:id/receive', ah(async (req, res) => {
  await inTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM purchase_orders WHERE po_id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'Purchase order not found');
    if (!['ordered', 'shipped'].includes(rows[0].status)) throw httpError(400, 'Already received or cancelled');
    await client.query(`UPDATE purchase_orders SET status = 'received' WHERE po_id = $1`, [req.params.id]);
    await client.query(
      'UPDATE inventory SET qty_on_hand = qty_on_hand + $2, updated_at = NOW() WHERE product_id = $1',
      [rows[0].product_id, rows[0].quantity]
    );
  });
  res.json({ ok: true });
}));

// GET /api/admin/tickets
router.get('/tickets', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, c.full_name AS customer, c.phone, e.full_name AS agent
       FROM support_tickets t JOIN customers c USING (customer_id)
       LEFT JOIN employees e ON e.employee_id = t.assigned_to
      ORDER BY (t.status IN ('resolved', 'closed')), t.created_at DESC`
  );
  res.json(rows);
}));

// PATCH /api/admin/tickets/:id  body: { status }
router.patch('/tickets/:id', ah(async (req, res) => {
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) throw httpError(400, 'Wrong status');
  await pool.query('UPDATE support_tickets SET status = $2 WHERE ticket_id = $1', [req.params.id, status]);
  res.json({ ok: true });
}));

// GET /api/admin/delivery-partners
router.get('/delivery-partners', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM delivery_partners ORDER BY partner_id');
  res.json(rows);
}));

module.exports = router;
