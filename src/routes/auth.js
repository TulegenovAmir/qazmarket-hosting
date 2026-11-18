const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { ah, createSession, requireCustomer } = require('../helpers');

const publicCustomer = (c) => ({ customer_id: c.customer_id, full_name: c.full_name, email: c.email, phone: c.phone });

// POST /api/auth/register
router.post('/register', ah(async (req, res) => {
  const { full_name, email, phone, password, city, street, apartment } = req.body;
  if (!full_name || !email || !phone || !password || !city || !street) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.replace(/[^\d+]/g, '');

  // one person = one account: check email AND phone (stops duplicate customers)
  const dup = await pool.query('SELECT email, phone FROM customers WHERE email = $1 OR phone = $2', [cleanEmail, cleanPhone]);
  if (dup.rowCount) {
    const field = dup.rows[0].email === cleanEmail ? 'email' : 'phone number';
    return res.status(409).json({ error: `An account with this ${field} already exists` });
  }

  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO customers (full_name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name.trim(), cleanEmail, cleanPhone, hash]
    );
    await client.query(
      `INSERT INTO addresses (customer_id, city, street, apartment, is_default) VALUES ($1, $2, $3, $4, TRUE)`,
      [rows[0].customer_id, city.trim(), street.trim(), apartment || null]
    );
    await client.query('COMMIT');
    const token = createSession({ type: 'customer', id: rows[0].customer_id });
    res.status(201).json({ token, user: publicCustomer(rows[0]) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// POST /api/auth/login
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM customers WHERE email = $1', [(email || '').trim().toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(password || '', rows[0].password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  const token = createSession({ type: 'customer', id: rows[0].customer_id });
  res.json({ token, user: publicCustomer(rows[0]) });
}));

// POST /api/auth/admin-login  (staff panel)
router.post('/admin-login', ah(async (req, res) => {
  if ((req.body.password || '') !== (process.env.ADMIN_PASSWORD || 'admin123')) {
    return res.status(401).json({ error: 'Wrong staff password' });
  }
  res.json({ token: createSession({ type: 'admin' }) });
}));

// GET /api/auth/me  -> profile + saved addresses
router.get('/me', requireCustomer, ah(async (req, res) => {
  const c = await pool.query('SELECT * FROM customers WHERE customer_id = $1', [req.user.id]);
  const a = await pool.query(
    'SELECT * FROM addresses WHERE customer_id = $1 ORDER BY is_default DESC, address_id', [req.user.id]
  );
  res.json({ user: publicCustomer(c.rows[0]), addresses: a.rows });
}));

// POST /api/auth/addresses  -> add another address
router.post('/addresses', requireCustomer, ah(async (req, res) => {
  const { city, street, apartment } = req.body;
  if (!city || !street) return res.status(400).json({ error: 'City and street are required' });
  const { rows } = await pool.query(
    `INSERT INTO addresses (customer_id, city, street, apartment) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.id, city.trim(), street.trim(), apartment || null]
  );
  res.status(201).json(rows[0]);
}));

module.exports = router;
