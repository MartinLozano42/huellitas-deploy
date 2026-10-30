import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pool from '../src/db.js';

dotenv.config();

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const nombre = process.env.ADMIN_NAME || 'Super';
const apellido = process.env.ADMIN_LASTNAME || 'Admin';
const ci = process.env.ADMIN_CI || `ADMIN-${Date.now()}`;
const telefono = process.env.ADMIN_PHONE || null;

if (!email || !password) {
  console.error('Faltan ADMIN_EMAIL o ADMIN_PASSWORD en .env');
  process.exit(1);
}

try {
  const [existing] = await pool.query('SELECT id FROM usuarios WHERE email=? LIMIT 1', [email]);
  const hash = await bcrypt.hash(password, 12);

  if (existing[0]) {
    await pool.query(`UPDATE usuarios SET password_hash=?, nombre=?, apellido=?, ci=?, telefono=?, rol='ADMIN', estado='APROBADO', email_verificado=TRUE WHERE id=?`, [hash, nombre, apellido, ci, telefono, existing[0].id]);
    console.log(`Admin actualizado: ${email}`);
  } else {
    await pool.query(`INSERT INTO usuarios (nombre, apellido, ci, email, telefono, password_hash, rol, estado, email_verificado) VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', 'APROBADO', TRUE)`, [nombre, apellido, ci, email, telefono, hash]);
    console.log(`Admin creado: ${email}`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
