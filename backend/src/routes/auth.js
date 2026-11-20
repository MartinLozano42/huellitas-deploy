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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]{2,100}$/;
const CI_RE = /^[0-9]{5,20}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

function normalizeText(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizePhone(value) {
  return value.replace(/[\s()-]/g, '');
}

function passwordIsStrong(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    Buffer.byteLength(password, 'utf8') <= 72 &&
    /[A-ZÁÉÍÓÚÑ]/.test(password) &&
    /[a-záéíóúñ]/.test(password) &&
    /\d/.test(password)
  );
}

function loginRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    res.setHeader(
      'Retry-After',
      String(Math.ceil((LOGIN_WINDOW_MS - (now - entry.startedAt)) / 1000))
    );

    return res.status(429).json({
      message: 'Demasiados intentos. Espera unos minutos e inténtalo nuevamente.'
    });
  }

  entry.count += 1;
  return next();
}

// REGISTRO
router.post('/register', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        message: 'Los datos enviados no son válidos.'
      });
    }

    const { nombre, apellido, ci, email, telefono, password } = req.body;

    if (
      typeof nombre !== 'string' ||
      typeof apellido !== 'string' ||
      typeof ci !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      (telefono !== undefined && telefono !== null && typeof telefono !== 'string')
    ) {
      return res.status(400).json({
        message: 'Los campos contienen tipos de datos incorrectos.'
      });
    }

    const cleanNombre = normalizeText(nombre);
    const cleanApellido = normalizeText(apellido);
    const cleanCi = ci.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const rawTelefono = (telefono || '').trim();
    const cleanTelefono = normalizePhone(rawTelefono);

    if (
      !cleanNombre ||
      !cleanApellido ||
      !cleanCi ||
      !normalizedEmail ||
      !password
    ) {
      return res.status(400).json({
        message: 'Nombre, apellido, CI, correo y contraseña son obligatorios.'
      });
    }

    if (!NAME_RE.test(cleanNombre)) {
      return res.status(400).json({
        message: 'El nombre debe contener entre 2 y 100 caracteres válidos.'
      });
    }

    if (!NAME_RE.test(cleanApellido)) {
      return res.status(400).json({
        message: 'El apellido debe contener entre 2 y 100 caracteres válidos.'
      });
    }

    if (!CI_RE.test(cleanCi)) {
      return res.status(400).json({
        message: 'El CI debe contener exclusivamente entre 5 y 20 dígitos.'
      });
    }

    if (
      normalizedEmail.length > 150 ||
      !EMAIL_RE.test(normalizedEmail)
    ) {
      return res.status(400).json({
        message: 'El correo electrónico no tiene un formato válido.'
      });
    }

    if (
      rawTelefono &&
      (!PHONE_RE.test(cleanTelefono) || !/^[0-9+() -]+$/.test(rawTelefono))
    ) {
      return res.status(400).json({
        message: 'El teléfono debe contener entre 7 y 15 dígitos y únicamente caracteres telefónicos válidos.'
      });
    }

    if (!passwordIsStrong(password)) {
      return res.status(400).json({
        message: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número. Máximo 72 bytes.'
      });
    }

    const [existing] = await pool.query(
      'SELECT id FROM usuarios WHERE email = ? OR ci = ? LIMIT 1',
      [normalizedEmail, cleanCi]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: 'El correo o CI ya está registrado.'
      });
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO usuarios
        (nombre, apellido, ci, email, telefono, password_hash, rol, estado, email_verificado)
       VALUES (?, ?, ?, ?, ?, ?, 'USER', 'PENDIENTE', FALSE)`,
      [
        cleanNombre,
        cleanApellido,
        cleanCi,
        normalizedEmail,
        cleanTelefono || null,
        hash
      ]
    );

    return res.status(201).json({
      message: 'Cuenta creada. Debe ser aprobada por el Admin antes de iniciar sesión.'
    });

  } catch (error) {
    console.error('Error en registro:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'El correo o CI ya está registrado.'
      });
    }

    return res.status(500).json({
      message: 'Error interno en el registro.'
    });
  }
});

// INICIO DE SESIÓN
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        message: 'Los datos enviados no son válidos.'
      });
    }

    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: 'Correo y contraseña son obligatorios.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail.length > 150 ||
      !EMAIL_RE.test(normalizedEmail) ||
      password.length > 72 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({
        message: 'Los datos de acceso no tienen un formato válido.'
      });
    }

    const [rows] = await pool.query(
      `SELECT id, nombre, apellido, email, password_hash, rol, estado
       FROM usuarios
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        message: 'Credenciales incorrectas.'
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        message: 'Credenciales incorrectas.'
      });
    }

    if (user.rol === 'USER' && user.estado !== 'APROBADO') {
      const messages = {
        PENDIENTE: 'Tu cuenta todavía está pendiente de aprobación por el Admin.',
        RECHAZADO: 'Tu cuenta fue rechazada. Contacta con el Admin.',
        SUSPENDIDO: 'Tu cuenta está suspendida.'
      };

      return res.status(403).json({
        message: messages[user.estado] || 'Tu cuenta no está habilitada.'
      });
    }

    if (!['USER', 'ADMIN'].includes(user.rol)) {
      return res.status(403).json({
        message: 'Rol de cuenta no válido.'
      });
    }

    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?',
      [user.id]
    );

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        rol: user.rol,
        nombre: user.nombre
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h'
      }
    );

    return res.json({
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
    console.error('Error en inicio de sesión:', error);

    return res.status(500).json({
      message: 'Error interno en el inicio de sesión.'
    });
  }
});

export default router;
