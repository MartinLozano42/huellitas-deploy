import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../db.js';

dotenv.config();

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token requerido.' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}

// Revalidate account state on every protected request so a suspended/rejected
// account cannot keep using an already-issued JWT until its expiration.
export async function requireActiveAccount(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, rol, estado FROM usuarios WHERE id=? LIMIT 1',
      [req.user?.id]
    );
    const account = rows[0];
    if (!account) return res.status(401).json({ message: 'La cuenta ya no existe.' });
    if (account.rol !== req.user.rol) return res.status(401).json({ message: 'La sesión ya no es válida. Inicia sesión nuevamente.' });
    if (account.estado === 'SUSPENDIDO' || account.estado === 'RECHAZADO') {
      return res.status(403).json({ message: 'La cuenta está deshabilitada. Contacta con el administrador.' });
    }
    if (account.rol === 'USER' && account.estado !== 'APROBADO') {
      return res.status(403).json({ message: 'La cuenta todavía no está aprobada.' });
    }
    return next();
  } catch (error) {
    console.error('No se pudo validar el estado de la cuenta:', error.message);
    return res.status(503).json({ message: 'No se pudo validar tu sesión. Intenta nuevamente.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'ADMIN') return res.status(403).json({ message: 'Se requiere rol ADMIN.' });
  next();
}

export function requireUser(req, res, next) {
  if (req.user?.rol !== 'USER') return res.status(403).json({ message: 'Se requiere una cuenta de usuario.' });
  next();
}
