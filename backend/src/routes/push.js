import { Router } from 'express';
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import pool from '../db.js';
import {
  authenticate,
  requireActiveAccount,
  requireUser
} from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireActiveAccount, requireUser);

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

// ==========================================
// OBTENER CLAVE PÚBLICA VAPID
// ==========================================

router.get('/public-key', (_req, res) => {
  const config = getVapidConfig();

  if (!config) {
    return res.status(503).json({
      message: 'Las notificaciones push todavía no están configuradas.'
    });
  }

  return res.json({
    publicKey: config.publicKey
  });
});

// ==========================================
// REGISTRAR DISPOSITIVO
// ==========================================

router.post('/subscribe', async (req, res) => {
  const subscription = req.body?.subscription;

  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(
    subscription?.keys?.p256dh || ''
  ).trim();
  const auth = String(
    subscription?.keys?.auth || ''
  ).trim();

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({
      message: 'La suscripción del dispositivo está incompleta.'
    });
  }

  if (!/^https:\/\/\S+$/i.test(endpoint)) {
    return res.status(400).json({
      message: 'El endpoint del dispositivo no es válido.'
    });
  }

  if (endpoint.length > 2048) {
    return res.status(400).json({
      message: 'El endpoint supera el tamaño permitido.'
    });
  }

  if (p256dh.length > 255 || auth.length > 255) {
    return res.status(400).json({
      message: 'Las claves del dispositivo no son válidas.'
    });
  }

  const endpointHash = createHash('sha256')
    .update(endpoint)
    .digest('hex');

  const userAgent = String(req.headers['user-agent'] || '')
    .slice(0, 500);

  try {
    await pool.query(
      `INSERT INTO push_subscriptions
        (
          usuario_id,
          endpoint,
          endpoint_hash,
          p256dh,
          auth,
          user_agent
        )
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         usuario_id=VALUES(usuario_id),
         endpoint=VALUES(endpoint),
         p256dh=VALUES(p256dh),
         auth=VALUES(auth),
         user_agent=VALUES(user_agent),
         updated_at=CURRENT_TIMESTAMP`,
      [
        req.user.id,
        endpoint,
        endpointHash,
        p256dh,
        auth,
        userAgent
      ]
    );

    return res.status(201).json({
      message: 'Este dispositivo quedó registrado para recibir notificaciones.'
    });
  } catch (error) {
    console.error('[PUSH] Error registrando dispositivo:', error);

    return res.status(500).json({
      message: 'No se pudo registrar este dispositivo.'
    });
  }
});

// ==========================================
// DESACTIVAR DISPOSITIVO
// ==========================================

router.delete('/subscribe', async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();

  if (!endpoint) {
    return res.status(400).json({
      message: 'No se recibió el endpoint del dispositivo.'
    });
  }

  const endpointHash = createHash('sha256')
    .update(endpoint)
    .digest('hex');

  try {
    await pool.query(
      `DELETE FROM push_subscriptions
       WHERE usuario_id=?
         AND endpoint_hash=?`,
      [req.user.id, endpointHash]
    );

    return res.json({
      message: 'Las notificaciones fueron desactivadas en este dispositivo.'
    });
  } catch (error) {
    console.error('[PUSH] Error eliminando dispositivo:', error);

    return res.status(500).json({
      message: 'No se pudo desactivar este dispositivo.'
    });
  }
});

export default router;
