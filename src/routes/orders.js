const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../db');
const { ah, httpError, requireCustomer } = require('../helpers');
const { changeStatus } = require('../orderService');

router.use(requireCustomer);


router.post('/', ah(async (req, res) => {
  const { items, address_id, method, card_number } = req.body;
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'Your cart is empty');
  if (!['card', 'qr', 'cash_on_delivery'].includes(method)) throw httpError(400, 'Choose a payment method');

  // merge the same product if it appears twice
  const qty = new Map();
  for (const it of items) {
    const id = Number(it.product_id);
    const q = Number(it.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1) throw httpError(400, 'Wrong cart data');
    qty.set(id, (qty.get(id) || 0) + q);
  }
  const ids = [...qty.keys()].sort((a, b) => a - b);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const addr = await client.query(
      'SELECT 1 FROM addresses WHERE address_id = $1 AND customer_id = $2', [address_id, req.user.id]
    );
    if (!addr.rowCount) throw httpError(400, 'Choose a delivery address');

    // lock the stock rows of these products until COMMIT
    const { rows: products } = await client.query(
      `SELECT p.product_id, p.name, p.price, p.is_active, i.qty_on_hand - i.qty_reserved AS available
         FROM inventory i JOIN products p USING (product_id)
        WHERE i.product_id = ANY($1::int[])
        ORDER BY i.product_id
          FOR UPDATE OF i`,
      [ids]
    );
    if (products.length !== ids.length) throw httpError(400, 'Some products are no longer sold');

    // 2) check stock
    const short = products.filter((p) => !p.is_active || p.available < qty.get(p.product_id));
    if (short.length) {
      throw httpError(409, 'Not enough stock: ' +
        short.map((p) => `${p.name} (available ${Math.max(p.available, 0)})`).join(', '));
    }

    // 3) create the order with prices from the database
    const total = products.reduce((sum, p) => sum + p.price * qty.get(p.product_id), 0);
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (customer_id, address_id, status, total_amount) VALUES ($1, $2, 'new', $3) RETURNING *`,
      [req.user.id, address_id, total]
    );
    for (const p of products) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [order.order_id, p.product_id, qty.get(p.product_id), p.price]
      );
    }

    // 4) payment
    let payStatus = 'pending'; // cash on delivery
    if (method !== 'cash_on_delivery') {
      const digits = String(card_number || '').replace(/\D/g, '');
      if (method === 'card' && digits.length < 12) throw httpError(400, 'Enter a card number (12-19 digits)');
      payStatus = method === 'card' && digits.endsWith('0000') ? 'failed' : 'success';
    }
    const paid = payStatus === 'success';
    await client.query(
      `INSERT INTO payments (order_id, method, amount, status, provider_ref, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.order_id, method, total, payStatus,
        paid ? 'PAY-' + crypto.randomBytes(4).toString('hex').toUpperCase() : null, paid ? new Date() : null]
    );

    if (payStatus === 'failed') {
      await client.query(`UPDATE orders SET status = 'cancelled' WHERE order_id = $1`, [order.order_id]);
      await client.query('COMMIT');
      return res.status(402).json({
        error: 'Payment was declined by the bank. The order was cancelled, no money was taken.',
        order_id: order.order_id,
      });
    }

    // 5) reserve stock, mark order as paid
    for (const p of products) {
      await client.query(
        'UPDATE inventory SET qty_reserved = qty_reserved + $2, updated_at = NOW() WHERE product_id = $1',
        [p.product_id, qty.get(p.product_id)]
      );
    }
    const status = paid ? 'paid' : 'new';
    await client.query('UPDATE orders SET status = $2 WHERE order_id = $1', [order.order_id, status]);

    await client.query('COMMIT');
    res.status(201).json({ order_id: order.order_id, status, total });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// GET /api/orders
router.get('/', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.order_id, o.order_date, o.status, o.total_amount,
            a.city, a.street, a.apartment,
            pay.method, pay.status AS payment_status,
            d.tracking_number, d.status AS delivery_status, dp.name AS courier,
            COALESCE(json_agg(json_build_object(
              'product_id', oi.product_id, 'name', p.name,
              'quantity', oi.quantity, 'unit_price', oi.unit_price) ORDER BY oi.product_id), '[]') AS items
       FROM orders o
       JOIN addresses a USING (address_id)
       JOIN order_items oi USING (order_id)
       JOIN products p ON p.product_id = oi.product_id
       LEFT JOIN payments pay ON pay.order_id = o.order_id
       LEFT JOIN deliveries d ON d.order_id = o.order_id
       LEFT JOIN delivery_partners dp ON dp.partner_id = d.partner_id
      WHERE o.customer_id = $1
      GROUP BY o.order_id, a.address_id, pay.payment_id, d.delivery_id, dp.partner_id
      ORDER BY o.order_date DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

// POST /api/orders/:id/cancel --- customer can cancel before packing
router.post('/:id/cancel', ah(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT status FROM orders WHERE order_id = $1 AND customer_id = $2', [req.params.id, req.user.id]
    );
    if (!rows.length) throw httpError(404, 'Order not found');
    if (!['new', 'paid'].includes(rows[0].status)) {
      throw httpError(400, 'This order is already packed — please contact support');
    }
    await changeStatus(client, Number(req.params.id), 'cancelled');
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

module.exports = router;
