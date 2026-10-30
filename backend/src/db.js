import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the backend .env independently of the directory used to start Node.
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });

const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';
let ssl;
if (sslEnabled) {
  ssl = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) {
    const caPath = path.isAbsolute(process.env.DB_SSL_CA)
      ? process.env.DB_SSL_CA
      : path.resolve(backendDir, process.env.DB_SSL_CA);
    ssl.ca = fs.readFileSync(caPath, 'utf8');
  }
}

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.JWT_SECRET) {
  console.warn('Configuración incompleta: revisa las variables privadas del backend (.env o entorno del hosting).');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'PRMascotas',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  enableKeepAlive: true,
  ...(ssl ? { ssl } : {})
});

export default pool;
