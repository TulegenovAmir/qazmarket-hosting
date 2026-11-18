const router = require('express').Router();
const pool = require('../db');
const { ah, requireCustomer } = require('../helpers');

const PRODUCT_SELECT = `
  SELECT p.product_id, p.sku, p.name, p.description, p.price, p.category_id,
         c.name AS category,
         GREATEST(i.qty_on_hand - i.qty_reserved, 0) AS available,
         ROUND(AVG(r.rating), 1) AS rating,
         COUNT(r.review_id) AS reviews_count
    FROM products p
    JOIN categories c USING (category_id)
    JOIN inventory i USING (product_id)
    LEFT JOIN reviews r USING (product_id)`;

// GET /api/products/categories
router.get('/categories', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT category_id, name FROM categories ORDER BY category_id');
  res.json(rows);
}));

// GET /api/products?q=phone&category=1
router.get('/', ah(async (req, res) => {
  const where = ['p.is_active'];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }
  if (req.query.category) {
    params.push(Number(req.query.category));
    where.push(`p.category_id = $${params.length}`);
  }
  const { rows } = await pool.query(
    `${PRODUCT_SELECT} WHERE ${where.join(' AND ')}
     GROUP BY p.product_id, c.name, i.qty_on_hand, i.qty_reserved
     ORDER BY p.category_id, p.product_id`,
    params
  );
  res.json(rows);
}));

// GET /api/products/:id  -> product + reviews
router.get('/:id', ah(async (req, res) => {
  const { rows } = await pool.query(
    `${PRODUCT_SELECT} WHERE p.product_id = $1
     GROUP BY p.product_id, c.name, i.qty_on_hand, i.qty_reserved`,
    [Number(req.params.id)]
  );
  if (!rows.length) return res.status(404).json({ error: 'Product not found' });
  const reviews = await pool.query(
    `SELECT r.rating, r.comment, r.created_at, cu.full_name
       FROM reviews r JOIN customers cu USING (customer_id)
      WHERE r.product_id = $1 ORDER BY r.created_at DESC`,
    [Number(req.params.id)]
  );
  res.json({ ...rows[0], reviews: reviews.rows });
}));

// POST /api/products/:id/reviews  -> only customers who received this product
router.post('/:id/reviews', requireCustomer, ah(async (req, res) => {
  const productId = Number(req.params.id);
  const rating = Number(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be 1-5' });

  const bought = await pool.query(
    `SELECT 1 FROM orders o JOIN order_items oi USING (order_id)
      WHERE o.customer_id = $1 AND oi.product_id = $2 AND o.status = 'delivered' LIMIT 1`,
    [req.user.id, productId]
  );
  if (!bought.rowCount) {
    return res.status(403).json({ error: 'You can review a product only after it is delivered to you' });
  }
  await pool.query(
    `INSERT INTO reviews (customer_id, product_id, rating, comment) VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id, product_id)
     DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()`,
    [req.user.id, productId, rating, (req.body.comment || '').trim() || null]
  );
  res.status(201).json({ ok: true });
}));

module.exports = router;
