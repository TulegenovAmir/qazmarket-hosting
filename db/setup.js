// Creates all tables and fills them with demo data.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

async function run() {
  const client = await pool.connect();
  try {
    console.log('1/4  Creating 15 tables (schema.sql) ...');
    await client.query(read('schema.sql'));

    console.log('2/4  Catalog, suppliers, couriers, staff, stock (seed.sql) ...');
    await client.query(read('seed.sql'));

    console.log('3/4  Demo customers ...');
    const hash = await bcrypt.hash('demo1234', 10);
    await client.query(
      `INSERT INTO customers (full_name, email, phone, password_hash) VALUES
         ('Adina Bassitova', 'demo@qazmarket.kz',    '+77011234567', $1),
         ('Daniyar Omarov',   'daniyar@qazmarket.kz', '+77017654321', $1)`,
      [hash]
    );

    console.log('4/4  Sample orders, reviews, tickets (seed_orders.sql) ...');
    await client.query(read('seed_orders.sql'));

    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*) FROM products) AS products,
              (SELECT COUNT(*) FROM orders)   AS orders,
              (SELECT COUNT(*) FROM customers) AS customers`
    );
    console.log(`\nDone! products: ${rows[0].products}, orders: ${rows[0].orders}, customers: ${rows[0].customers}`);
    console.log('Customer login: demo@qazmarket.kz / demo1234');
    console.log(`Admin password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\nSetup failed:', err.message);
  console.error('Check that PostgreSQL is running and DATABASE_URL in .env is correct.');
  process.exit(1);
});
