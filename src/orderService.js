// Business rules for order status changes.

const crypto = require('crypto');
const { httpError } = require('./helpers');


const FLOW = {
  new:       ['packed', 'cancelled'],   // cash on delivery: not paid yet
  paid:      ['packed', 'cancelled'],
  packed:    ['shipped', 'cancelled'],
  shipped:   ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned:  [],
};

async function changeStatus(client, orderId, to, { partnerId } = {}) {
  const { rows } = await client.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
  if (!rows.length) throw httpError(404, 'Order not found');
  const order = rows[0];

  if (!FLOW[order.status].includes(to)) {
    throw httpError(400, `Order #${orderId} cannot go from ${order.status} to ${to}`);
  }

  const { rows: items } = await client.query(
    'SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]
  );

  if (to === 'cancelled') {
    // give the reserved items back to the shop
    for (const it of items) {
      await client.query(
        `UPDATE inventory SET qty_reserved = qty_reserved - $2, updated_at = NOW() WHERE product_id = $1`,
        [it.product_id, it.quantity]
      );
    }
    await client.query(
      `UPDATE payments SET status = CASE WHEN status = 'success' THEN 'refunded' ELSE 'failed' END
        WHERE order_id = $1`, [orderId]
    );
  }

  if (to === 'shipped') {
    let partner = partnerId;
    if (!partner) {
      const p = await client.query('SELECT partner_id FROM delivery_partners ORDER BY partner_id LIMIT 1');
      partner = p.rows[0].partner_id;
    }
    const tracking = 'QZ' + orderId + crypto.randomInt(1000, 9999) + 'KZ';
    await client.query(
      `INSERT INTO deliveries (order_id, partner_id, tracking_number, status, shipped_at)
       VALUES ($1, $2, $3, 'in_transit', NOW())`,
      [orderId, partner, tracking]
    );
  }

  if (to === 'delivered') {
    // items physically left the warehouse: remove from stock and from reserved
    for (const it of items) {
      await client.query(
        `UPDATE inventory SET qty_on_hand = qty_on_hand - $2, qty_reserved = qty_reserved - $2,
                updated_at = NOW() WHERE product_id = $1`,
        [it.product_id, it.quantity]
      );
    }
    await client.query(
      `UPDATE deliveries SET status = 'delivered', delivered_at = NOW() WHERE order_id = $1`, [orderId]
    );
    // cash on delivery is paid now
    await client.query(
      `UPDATE payments SET status = 'success', paid_at = NOW() WHERE order_id = $1 AND status = 'pending'`,
      [orderId]
    );
  }

  if (to === 'returned') {
    for (const it of items) {
      await client.query(
        `UPDATE inventory SET qty_on_hand = qty_on_hand + $2, updated_at = NOW() WHERE product_id = $1`,
        [it.product_id, it.quantity]
      );
    }
    await client.query(`UPDATE payments SET status = 'refunded' WHERE order_id = $1`, [orderId]);
  }

  await client.query('UPDATE orders SET status = $2 WHERE order_id = $1', [orderId, to]);
}

module.exports = { FLOW, changeStatus };
