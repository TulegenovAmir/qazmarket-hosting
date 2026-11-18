// QazMarket - online shop server

require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./src/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/support', require('./src/routes/support'));
app.use('/api/admin', require('./src/routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

// one place for all errors
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error, see terminal' });
});

const PORT = process.env.PORT || 3000;

// check the database first, then start
pool.query('SELECT COUNT(*) FROM products')
  .then(() => {
    app.listen(PORT, () => console.log(`QazMarket is running: http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Cannot use the database:', err.message);
    console.error('1) Is PostgreSQL running?  sudo service postgresql start');
    console.error('2) Is DATABASE_URL in .env correct?');
    console.error('3) Did you create the tables?  npm run db:setup');
    process.exit(1);
  });
