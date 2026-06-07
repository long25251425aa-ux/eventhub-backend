const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eventhub',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  port: parseInt(process.env.DB_PORT) || 3306,
  timezone: '+07:00',
});

pool.getConnection()
  .then(c => { console.log('[DB] MySQL connected'); c.release(); })
  .catch(e => console.error('[DB] Connection error:', e.message));

module.exports = pool;

