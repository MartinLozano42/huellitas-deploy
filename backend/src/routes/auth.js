import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../db.js';

dotenv.config();
const router = Router();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function loginRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    res.setHeader('Retry-After', String(Math.ceil((LOGIN_WINDOW_MS - (now - entry.startedAt)) / 1000)));
    return res.status(429).json({ message: 'Demasiados intentos. Espera unos minutos e inténtalo nuevamente.' });
  }
  entry.count += 1;
  return next();
}


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]{2,100}$/;
const CI_RE = /^[0-9]{5,20}$/;
const PHONE_RE = /^[0-9+() -]{7,30}$/;

function passwordIsStrong(password) {
  return typeof password === 'string'
    && password.length >= 8
    && /[A-ZÁÉÍÓÚÑ]/.test(password)
    && /[a-záéíóúñ]/.test(password)
    && /\d/.test(password);
}

router.post('/register', async (req, res) => {
  try {
    const { nombre, apellido, ci, email, telefono, password } = req.body || {};

    const cleanNombre = String(nombre || '').trim();
    const cleanApellido = String(apellido || '').trim();
    const cleanCi = String(ci || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const cleanTelefono = String(telefono || '').trim();

    if (!cleanNombre || !cleanApellido || !cleanCi || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Nombre, apellido, CI, correo y contraseña son obligatorios.' });
    }

    if (!NAME_RE.test(cleanNombre) || !NAME_RE.test(cleanApellido)) {
      return res.status(400).json({ message: 'Nombre y apellido solo deben contener letras, espacios o guiones.' });
    }

    if (!CI_RE.test(cleanCi)) {
      return res.status(400).json({ message: 'El CI debe contener entre 5 y 20 dígitos.' });
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Ingresa un correo electrónico válido.' });
    }

    if (cleanTelefono && !PHONE_RE.test(cleanTelefono)) {
      return res.status(400).json({ message: 'El teléfono contiene caracteres no válidos.' });
    }

    if (!passwordIsStrong(password)) {
      return res.status(400).json({ message: 'La contraseña debe tener 8 caracteres e incluir mayúscula, minúscula y número.' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM usuarios WHERE email=? OR ci=? LIMIT 1',
      [normalizedEmail, cleanCi]
    );

    if (existing[0]) {
      return res.status(409).json({ message: 'El correo o CI ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO usuarios (nombre, apellido, ci, email, telefono, password_hash, rol, estado, email_verificado)
       VALUES (?, ?, ?, ?, ?, ?, 'USER', 'PENDIENTE', FALSE)`,
      [cleanNombre, cleanApellido, cleanCi, normalizedEmail, cleanTelefono || null, hash]
    );

    res.status(201).json({ message: 'Cuenta creada. Debe ser aprobada por el Admin antes de iniciar sesión.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error interno en el registro.' });
  }
});

router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Correo y contraseña son obligatorios.' });
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Ingresa un correo electrónico válido.' });
    }

    const [rows] = await pool.query(
      'SELECT id, nombre, apellido, email, password_hash, rol, estado FROM usuarios WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Credenciales incorrectas.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Credenciales incorrectas.' });

    if (user.rol === 'USER' && user.estado !== 'APROBADO') {
      const messages = {
        PENDIENTE: 'Tu cuenta todavía está pendiente de aprobación por el Admin.',
        RECHAZADO: 'Tu cuenta fue rechazada. Contacta con el Admin.',
        SUSPENDIDO: 'Tu cuenta está suspendida.'
      };
      return res.status(403).json({ message: messages[user.estado] || 'Tu cuenta no está habilitada.' });
    }

    if (!['USER', 'ADMIN'].includes(user.rol)) {
      return res.status(403).json({ message: 'Rol de cuenta no válido.' });
    }

    await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error interno en el inicio de sesión.' });
  }
});

export default router;
