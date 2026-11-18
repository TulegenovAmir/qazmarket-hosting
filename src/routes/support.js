const router = require('express').Router();
const pool = require('../db');
const { ah, requireCustomer } = require('../helpers');

router.use(requireCustomer);

// GET /api/support  -> my tickets
router.get('/', ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.ticket_id, t.order_id, t.type, t.status, t.description, t.created_at, e.full_name AS agent
       FROM support_tickets t LEFT JOIN employees e ON e.employee_id = t.assigned_to
      WHERE t.customer_id = $1 ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

// POST /api/support  -> new question / complaint / return
router.post('/', ah(async (req, res) => {
  const { type, description } = req.body;
  const orderId = req.body.order_id ? Number(req.body.order_id) : null;
  if (!['question', 'complaint', 'return'].includes(type)) return res.status(400).json({ error: 'Choose a ticket type' });
  if (!description || description.trim().length < 5) return res.status(400).json({ error: 'Please describe the problem' });

  if (orderId) {
    const own = await pool.query('SELECT status FROM orders WHERE order_id = $1 AND customer_id = $2', [orderId, req.user.id]);
    if (!own.rowCount) return res.status(400).json({ error: 'Order not found' });
    if (type === 'return' && own.rows[0].status !== 'delivered') {
      return res.status(400).json({ error: 'A return is possible only for a delivered order' });
    }
  } else if (type === 'return') {
    return res.status(400).json({ error: 'Choose the order you want to return' });
  }

  // assign to the first support employee
  const agent = await pool.query(`SELECT employee_id FROM employees WHERE role = 'support' ORDER BY employee_id LIMIT 1`);
  const { rows } = await pool.query(
    `INSERT INTO support_tickets (customer_id, order_id, assigned_to, type, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, orderId, agent.rows[0]?.employee_id || null, type, description.trim()]
  );
  res.status(201).json(rows[0]);
}));

module.exports = router;
