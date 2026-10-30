import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import publicRoutes from './routes/public.js';
import pool from './db.js';
import communicationRoutes from './routes/communication.js';
import reportRoutes from './routes/reports.js';
import mediaRoutes from './routes/media.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(currentDir, '../uploads');

const allowedOrigins = String(process.env.CORS_ORIGINS || process.env.PUBLIC_FRONTEND_URL || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'Huellitas API', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, service: 'Huellitas API', database: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/user', communicationRoutes);
app.use('/api/user', reportRoutes);
app.use('/api/user/uploads', mediaRoutes);
app.use('/api/public', publicRoutes);
// Los QR físicos abren la ficha pública del frontend. Los clientes API utilizan /api/public/qr/:codigo.
app.get('/qr/:codigo', (req, res) => {
  // Do not infer the frontend from PUBLIC_QR_BASE_URL: older deployments may
  // point that variable back to this API and create a redirect loop.
  // For deployment, set PUBLIC_FRONTEND_URL to the public frontend origin.
  const frontendBase = String(process.env.PUBLIC_FRONTEND_URL || 'http://localhost:5173')
    .trim().replace(/\/$/, '');
  res.redirect(302, `${frontendBase}/qr/${encodeURIComponent(req.params.codigo)}`);
});

app.use((err, _req, res, _next) => {
  if (err.message === 'Origen no permitido por CORS.') {
    return res.status(403).json({ message: 'Origen no permitido.' });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'La solicitud supera el tamaño permitido.' });
  console.error('Error no controlado:', err.message);
  res.status(500).json({ message: 'Error interno.' });
});

app.listen(port, () => {
  console.log(`PRMascotas API escuchando en http://localhost:${port}`);
});
