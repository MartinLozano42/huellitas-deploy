import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireActiveAccount, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveAccount, requireUser);

function isMissingSprint3Schema(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

function schemaError(res) {
  return res.status(503).json({
    message: 'Falta aplicar la migración de Sprint 3 de Huellitas. Ejecuta database/migration_sprint3_comunicacion_reportes.sql en la base de datos antes de usar esta función.'
  });
}

async function notifyUser(userId, tipo, titulo, mensaje) {
  if (!userId) return;
  await pool.query(
    'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje) VALUES (?, ?, ?, ?)',
    [userId, tipo, titulo, mensaje]
  );
}

// Crea u obtiene una conversación existente para no duplicar el chat al pulsar varias veces.
async function getOrCreateConversation({ mascotaId = null, reporteId = null, requesterId, targetId }) {
  if (!targetId || Number(targetId) === Number(requesterId)) {
    const error = new Error('No puedes iniciar una conversación contigo mismo.');
    error.status = 409;
    throw error;
  }
  const a = Math.min(Number(requesterId), Number(targetId));
  const b = Math.max(Number(requesterId), Number(targetId));
  let existing = [];
  // Si la conversación empezó desde el QR y luego alguien entra desde un reporte,
  // se reutiliza el mismo hilo para esa mascota y ese par de participantes.
  if (mascotaId) {
    [existing] = await pool.query(
      `SELECT id FROM conversaciones
       WHERE mascota_id=? AND usuario_iniciador_id=? AND usuario_receptor_id=? LIMIT 1`,
      [mascotaId, a, b]
    );
  }
  if (!existing[0] && reporteId) {
    [existing] = await pool.query(
      `SELECT id FROM conversaciones
       WHERE reporte_id=? AND usuario_iniciador_id=? AND usuario_receptor_id=? LIMIT 1`,
      [reporteId, a, b]
    );
  }
  if (existing[0]) return { id: existing[0].id, created: false };
  const [result] = await pool.query(
    `INSERT INTO conversaciones (mascota_id, reporte_id, usuario_iniciador_id, usuario_receptor_id, estado)
     VALUES (?, ?, ?, ?, 'ACTIVA')`,
    [mascotaId, reporteId, a, b]
  );
  return { id: result.insertId, created: true };
}

router.get('/conversaciones', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.mascota_id, c.reporte_id, c.estado, c.created_at, c.updated_at,
              COALESCE(m.nombre, 'Mascota') AS mascota,
              COALESCE(m.foto, r.foto) AS foto_mascota,
              u.id AS otro_usuario_id, CONCAT(u.nombre, ' ', u.apellido) AS otro_usuario,
              ultimo.contenido AS ultimo_mensaje, ultimo.created_at AS ultimo_mensaje_at,
              (SELECT COUNT(*) FROM mensajes n
               WHERE n.conversacion_id=c.id AND n.remitente_id<>? AND n.leido_at IS NULL) AS no_leidos
       FROM conversaciones c
       LEFT JOIN mascotas m ON m.id=c.mascota_id
       LEFT JOIN reportes r ON r.id=c.reporte_id
       JOIN usuarios u ON u.id=CASE WHEN c.usuario_iniciador_id=? THEN c.usuario_receptor_id ELSE c.usuario_iniciador_id END
       LEFT JOIN mensajes ultimo ON ultimo.id=(
         SELECT MAX(mm.id) FROM mensajes mm WHERE mm.conversacion_id=c.id
       )
       WHERE c.usuario_iniciador_id=? OR c.usuario_receptor_id=?
       ORDER BY COALESCE(ultimo.created_at, c.created_at) DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );
    res.json(rows);
  } catch (error) {
    if (isMissingSprint3Schema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar las conversaciones.' });
  }
});

router.post('/conversaciones', async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '').trim();
    const reporteId = req.body?.reporte_id ? Number(req.body.reporte_id) : null;
    const avistamientoId = req.body?.avistamiento_id ? Number(req.body.avistamiento_id) : null;
    if (!codigo && !reporteId && !avistamientoId) {
      return res.status(400).json({ message: 'Indica un código QR, un reporte o un avistamiento para iniciar el contacto.' });
    }
    if ([reporteId, avistamientoId].some((id) => id !== null && (!Number.isSafeInteger(id) || id <= 0))) {
      return res.status(400).json({ message: 'El identificador del reporte o avistamiento no es válido.' });
    }

    let mascotaId = null;
    let targetId = null;
    let relatedReportId = null;

    if (codigo) {
      const [rows] = await pool.query(
        `SELECT m.id mascota_id, m.usuario_id propietario_id, m.nombre
         FROM identificaciones_qr q INNER JOIN mascotas m ON m.id=q.mascota_id
         WHERE q.codigo=? AND q.estado='ACTIVO' LIMIT 1`,
        [codigo]
      );
      if (!rows[0]) return res.status(404).json({ message: 'No se encontró una identificación QR activa.' });
      mascotaId = rows[0].mascota_id;
      targetId = rows[0].propietario_id;
    } else if (avistamientoId) {
      const [rows] = await pool.query(
        `SELECT a.id, a.usuario_id AS avistador_id, r.id AS reporte_id, r.mascota_id,
                r.usuario_id AS propietario_id, r.estado, r.tipo,
                COALESCE(m.nombre, 'Mascota') AS nombre_mascota
         FROM avistamientos a
         INNER JOIN reportes r ON r.id=a.reporte_id
         LEFT JOIN mascotas m ON m.id=r.mascota_id
         WHERE a.id=? AND r.usuario_id=? AND r.tipo='PERDIDA' LIMIT 1`,
        [avistamientoId, req.user.id]
      );
      if (!rows[0]) return res.status(404).json({ message: 'No se encontró un avistamiento asociado a un aviso de tu cuenta.' });
      const sighting = rows[0];
      mascotaId = sighting.mascota_id || null;
      relatedReportId = sighting.reporte_id;
      targetId = sighting.avistador_id;
    } else {
      const [rows] = await pool.query(
        `SELECT r.id, r.tipo, r.mascota_id, r.usuario_id reportante_id,
                COALESCE(m.nombre, 'Mascota') AS nombre_mascota,
                m.usuario_id propietario_id
         FROM reportes r LEFT JOIN mascotas m ON m.id=r.mascota_id
         WHERE r.id=? AND r.estado='ACTIVO' LIMIT 1`,
        [reporteId]
      );
      if (!rows[0]) return res.status(404).json({ message: 'El reporte no existe o ya está cerrado.' });
      const report = rows[0];
      mascotaId = report.mascota_id || null;
      relatedReportId = report.id;
      // En un reporte de pérdida se contacta al propietario/reportante. En un hallazgo,
      // se contacta al reportante, salvo que el propio reportante sea quien lo solicita.
      if (report.tipo === 'PERDIDA') targetId = report.reportante_id;
      else targetId = Number(report.reportante_id) === Number(req.user.id) ? report.propietario_id : report.reportante_id;
    }

    if (Number(targetId) === Number(req.user.id)) {
      return res.status(409).json({ message: 'Este reporte o QR corresponde a tu cuenta; no necesitas iniciar un chat contigo mismo.' });
    }

    const conversation = await getOrCreateConversation({
      mascotaId,
      reporteId: relatedReportId,
      requesterId: req.user.id,
      targetId
    });

    if (conversation.created) {
      const [petRows] = mascotaId
        ? await pool.query('SELECT nombre FROM mascotas WHERE id=? LIMIT 1', [mascotaId])
        : [[]];
      const petName = petRows[0]?.nombre || 'una mascota reportada';
      await notifyUser(targetId, 'CHAT_NUEVO', 'Nuevo contacto en Huellitas', `Alguien quiere contactar contigo por ${petName}.`);
    }
    res.status(conversation.created ? 201 : 200).json({
      message: conversation.created ? 'Conversación creada.' : 'Se abrió la conversación existente.',
      conversacion_id: conversation.id
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (isMissingSprint3Schema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudo iniciar la conversación.' });
  }
});

router.get('/conversaciones/:id/mensajes', async (req, res) => {
  try {
    const [members] = await pool.query(
      `SELECT id FROM conversaciones WHERE id=? AND (usuario_iniciador_id=? OR usuario_receptor_id=?) LIMIT 1`,
      [req.params.id, req.user.id, req.user.id]
    );
    if (!members[0]) return res.status(404).json({ message: 'Conversación no encontrada.' });

    await pool.query(
      `UPDATE mensajes SET leido_at=NOW()
       WHERE conversacion_id=? AND remitente_id<>? AND leido_at IS NULL`,
      [req.params.id, req.user.id]
    );
    const [rows] = await pool.query(
      `SELECT msg.id, msg.contenido, msg.remitente_id, msg.leido_at, msg.created_at,
              CONCAT(u.nombre, ' ', u.apellido) AS remitente
       FROM mensajes msg INNER JOIN usuarios u ON u.id=msg.remitente_id
       WHERE msg.conversacion_id=? ORDER BY msg.id ASC LIMIT 500`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    if (isMissingSprint3Schema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los mensajes.' });
  }
});

router.post('/conversaciones/:id/mensajes', async (req, res) => {
  try {
    const mensaje = String(req.body?.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ message: 'Escribe un mensaje antes de enviarlo.' });
    if (mensaje.length > 2000) return res.status(400).json({ message: 'El mensaje no puede superar 2000 caracteres.' });

    const [rows] = await pool.query(
      `SELECT id, usuario_iniciador_id, usuario_receptor_id, estado
       FROM conversaciones WHERE id=? AND (usuario_iniciador_id=? OR usuario_receptor_id=?) LIMIT 1`,
      [req.params.id, req.user.id, req.user.id]
    );
    const conversation = rows[0];
    if (!conversation) return res.status(404).json({ message: 'Conversación no encontrada.' });
    if (conversation.estado !== 'ACTIVA') return res.status(409).json({ message: 'Esta conversación está cerrada.' });

    const [result] = await pool.query(
      'INSERT INTO mensajes (conversacion_id, remitente_id, contenido) VALUES (?, ?, ?)',
      [conversation.id, req.user.id, mensaje]
    );
    await pool.query('UPDATE conversaciones SET ultimo_mensaje_at=NOW(), updated_at=NOW() WHERE id=?', [conversation.id]);
    const recipient = Number(conversation.usuario_iniciador_id) === Number(req.user.id)
      ? conversation.usuario_receptor_id : conversation.usuario_iniciador_id;
    await notifyUser(recipient, 'CHAT_MENSAJE', 'Nuevo mensaje', 'Tienes un mensaje nuevo en una conversación de Huellitas.');

    const [saved] = await pool.query(
      `SELECT id, contenido AS mensaje, remitente_id, leido_at, created_at FROM mensajes WHERE id=? LIMIT 1`,
      [result.insertId]
    );
    res.status(201).json(saved[0]);
  } catch (error) {
    if (isMissingSprint3Schema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudo enviar el mensaje.' });
  }
});

router.get('/notificaciones', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, tipo, titulo, mensaje, leida, fecha
       FROM notificaciones WHERE usuario_id=? ORDER BY fecha DESC, id DESC LIMIT 100`,
      [req.user.id]
    );
    const [[counts]] = await pool.query(
      'SELECT COUNT(*) AS no_leidas FROM notificaciones WHERE usuario_id=? AND leida=FALSE',
      [req.user.id]
    );
    res.json({ items: rows, no_leidas: Number(counts.no_leidas || 0) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar las notificaciones.' });
  }
});

router.patch('/notificaciones/:id/leida', async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE notificaciones SET leida=TRUE WHERE id=? AND usuario_id=?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Notificación no encontrada.' });
    res.json({ message: 'Notificación marcada como leída.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar la notificación.' });
  }
});

router.patch('/notificaciones/leidas/todas', async (req, res) => {
  try {
    await pool.query('UPDATE notificaciones SET leida=TRUE WHERE usuario_id=? AND leida=FALSE', [req.user.id]);
    res.json({ message: 'Todas las notificaciones se marcaron como leídas.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron actualizar las notificaciones.' });
  }
});

router.get('/preferencias-alertas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT radio_alerta_km AS radio_km, avistamientos_cercanos AS activo, updated_at
       FROM preferencias_notificacion WHERE usuario_id=? LIMIT 1`,
      [req.user.id]
    );
    res.json(rows[0] || { latitud: null, longitud: null, radio_km: 10, activo: false });
  } catch (error) {
    if (isMissingSprint3Schema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar las preferencias de alertas.' });
  }
});

router.put('/preferencias-alertas', async (req, res) => {
  try {
    const radio = Number(req.body?.radio_km ?? 10);
    const activo = Boolean(req.body?.activo);
    if (!Number.isFinite(radio) || radio < 0 || radio > 500) {
      return res.status(400).json({ message: 'El radio debe estar entre 0 y 500 km.' });
    }
    await pool.query(
      `INSERT INTO preferencias_notificacion (usuario_id, radio_alerta_km, avistamientos_cercanos)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE radio_alerta_km=VALUES(radio_alerta_km), avistamientos_cercanos=VALUES(avistamientos_cercanos)`,
      [req.user.id, radio, activo ? 1 : 0]
    );
    res.json({ message: 'Preferencias de alertas guardadas.', latitud: null, longitud: null, radio_km: radio, activo });
  } catch (error) {
    if (isMissingSprint3Schema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudieron guardar las preferencias de alertas.' });
  }
});

export default router;
