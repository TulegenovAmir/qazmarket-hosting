// One shared connection pool to PostgreSQL
const { Pool, types } = require('pg');

// NUMERIC (prices) comes back as text by default -> turn it into a JS number
types.setTypeParser(1700, (v) => parseFloat(v));
// COUNT(*) comes back as BIGINT text -> number
types.setTypeParser(20, (v) => parseInt(v, 10));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
