import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Limitador temporal en memoria para reducir spam en avisos públicos por QR.
const qrNoticeAttempts = new Map();
function isQrNoticeRateLimited(key) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 4;
  const current = (qrNoticeAttempts.get(key) || []).filter((time) => now - time < windowMs);
  if (current.length >= maxAttempts) {
    qrNoticeAttempts.set(key, current);
    return true;
  }
  current.push(now);
  qrNoticeAttempts.set(key, current);
  return false;
}

async function findQr(req, res) {
  try {
    const codigo = String(req.params.codigo || '').trim();
    const [rows] = await pool.query(
      `SELECT q.codigo, q.estado qr_estado,
              m.id mascota_id, m.nombre, m.especie, m.raza, m.sexo, m.edad,
              m.foto, m.vacunado, m.caracteristicas, m.estado estado_mascota
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id=q.mascota_id
       WHERE q.codigo=? LIMIT 1`,
      [codigo]
    );
    const qr = rows[0];
    if (!qr || qr.qr_estado !== 'ACTIVO') {
      return res.status(404).json({ message: 'No se encontró un QR activo de Huellitas con ese código.' });
    }
    // Nunca se devuelve CI, email, teléfono, domicilio ni el id interno del propietario.
    res.json({
      codigo: qr.codigo,
      mascota: {
        id: qr.mascota_id,
        nombre: qr.nombre,
        especie: qr.especie,
        raza: qr.raza,
        sexo: qr.sexo,
        edad: qr.edad,
        foto: qr.foto,
        vacunado: qr.vacunado,
        caracteristicas: qr.caracteristicas,
        estado: qr.estado_mascota
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo consultar el QR.' });
  }
}

router.get('/qr/:codigo', findQr);

// Aviso anónimo desde el QR físico: no requiere cuenta ni guarda datos del visitante.
router.post('/qr/:codigo/aviso', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim();
    const rateKey = `${req.ip || 'unknown'}:${codigo}`;
    if (isQrNoticeRateLimited(rateKey)) {
      return res.status(429).json({ message: 'Se alcanzó el límite de avisos. Espera un minuto e inténtalo nuevamente.' });
    }
    const mensaje = String(req.body?.mensaje || '').trim();
    const ubicacion = String(req.body?.ubicacion || '').trim();

    if (!mensaje || mensaje.length < 5) {
      return res.status(400).json({ message: 'Cuéntanos un poco más en el aviso (mínimo 5 caracteres).' });
    }
    if (mensaje.length > 1000) {
      return res.status(400).json({ message: 'El aviso no puede superar los 1000 caracteres.' });
    }
    if (ubicacion.length > 180) {
      return res.status(400).json({ message: 'La ubicación no puede superar los 180 caracteres.' });
    }

    const [rows] = await pool.query(
      `SELECT q.codigo, m.id mascota_id, m.nombre, m.usuario_id propietario_id
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id=q.mascota_id
       WHERE q.codigo=? AND q.estado='ACTIVO' LIMIT 1`,
      [codigo]
    );
    const qr = rows[0];
    if (!qr) return res.status(404).json({ message: 'No se encontró un QR activo con ese código.' });

    const detalle = [
      `Aviso anónimo recibido mediante el QR de ${qr.nombre}.`,
      ubicacion ? `Ubicación indicada: ${ubicacion}.` : '',
      `Mensaje: ${mensaje}`
    ].filter(Boolean).join(' ');

    // Notificar al propietario y a todas las cuentas administradoras.
    const recipients = new Set([Number(qr.propietario_id)]);
    const [admins] = await pool.query("SELECT id FROM usuarios WHERE rol='ADMIN' AND estado='APROBADO'");
    for (const admin of admins) recipients.add(Number(admin.id));

    const values = [...recipients].filter(Number.isSafeInteger);
    if (values.length) {
      const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
      const params = values.flatMap((userId) => [
        userId,
        'QR_AVISO_ANONIMO',
        `Nuevo aviso sobre ${qr.nombre}`,
        detalle
      ]);
      await pool.query(
        `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje) VALUES ${placeholders}`,
        params
      );
    }

    return res.status(201).json({
      message: 'Tu aviso fue enviado de forma anónima al propietario y al equipo de Huellitas.'
    });
  } catch (error) {
    console.error('Error al procesar aviso anónimo del QR:', error);
    return res.status(500).json({ message: 'No se pudo enviar el aviso. Intenta nuevamente.' });
  }
});

// Avisos públicos: no exponen teléfono, email, CI ni información privada de quien reporta.
router.get('/reportes', async (req, res) => {
  try {
    const tipo = String(req.query?.tipo || '').trim().toUpperCase();
    const search = String(req.query?.q || '').trim().slice(0, 100);
    const estado = String(req.query?.estado || 'ACTIVO').trim().toUpperCase();
    const params = [];
    let sql = `
      SELECT r.id, r.mascota_id, r.tipo, r.fecha_reporte, r.descripcion, r.ubicacion,
             r.latitud, r.longitud, r.foto, r.estado,
             COALESCE(r.nombre_mascota, m.nombre, 'Mascota') AS mascota,
             COALESCE(r.especie_mascota, m.especie, 'OTRO') AS especie,
             COALESCE(r.raza_mascota, m.raza) AS raza,
             COALESCE(r.sexo_mascota, m.sexo) AS sexo,
             COALESCE(r.edad_mascota, m.edad) AS edad,
             COALESCE(r.foto, m.foto) AS foto_mascota,
             (SELECT COUNT(*) FROM identificaciones_qr q WHERE q.mascota_id=m.id AND q.estado='ACTIVO') AS tiene_qr
      FROM reportes r LEFT JOIN mascotas m ON m.id=r.mascota_id
      WHERE 1=1`;
    if (estado && ['ACTIVO', 'RESUELTO', 'CERRADO'].includes(estado)) {
      sql += ' AND r.estado=?'; params.push(estado);
    }
    if (tipo && ['PERDIDA', 'ENCONTRADA'].includes(tipo)) {
      sql += ' AND r.tipo=?'; params.push(tipo);
    }
    if (search) {
      const q = `%${search}%`;
      sql += ` AND (COALESCE(r.nombre_mascota,m.nombre) LIKE ? OR r.ubicacion LIKE ? OR r.descripcion LIKE ? OR COALESCE(r.raza_mascota,m.raza) LIKE ?)`;
      params.push(q, q, q, q);
    }
    sql += ' ORDER BY r.fecha_reporte DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    if (['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(error?.code)) {
      return res.status(503).json({ message: 'Los avisos necesitan la migración Sprint 3. Ejecuta database/migration_sprint3_comunicacion_reportes.sql.' });
    }
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los avisos de Huellitas.' });
  }
});

router.get('/reportes/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.mascota_id, r.tipo, r.fecha_reporte, r.descripcion, r.ubicacion,
              r.latitud, r.longitud, r.foto, r.estado,
              COALESCE(r.nombre_mascota, m.nombre, 'Mascota') AS mascota,
              COALESCE(r.especie_mascota, m.especie, 'OTRO') AS especie,
              COALESCE(r.raza_mascota, m.raza) AS raza,
              COALESCE(r.sexo_mascota, m.sexo) AS sexo,
              COALESCE(r.edad_mascota, m.edad) AS edad,
              COALESCE(r.foto, m.foto) AS foto_mascota
       FROM reportes r LEFT JOIN mascotas m ON m.id=r.mascota_id
       WHERE r.id=? LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Aviso no encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    if (['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(error?.code)) {
      return res.status(503).json({ message: 'Los avisos necesitan la migración Sprint 3.' });
    }
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el aviso.' });
  }
});

export { findQr };
export default router;
