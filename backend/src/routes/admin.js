import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import pool from '../db.js';
import { authenticate, requireActiveAccount, requireAdmin } from '../middleware/auth.js';
const router = Router();
router.use(authenticate, requireActiveAccount, requireAdmin);
router.get('/dashboard', async (_req, res) => {
  try {
    const [[users]] = await pool.query(`SELECT COUNT(*) total_usuarios FROM usuarios WHERE rol='USER'`);
    const [[pendingUsers]] = await pool.query(`SELECT COUNT(*) pendientes FROM usuarios WHERE rol='USER' AND estado='PENDIENTE'`);
    const [[pets]] = await pool.query(`SELECT COUNT(*) total_mascotas FROM mascotas`);
    const [[lost]] = await pool.query(`SELECT COUNT(*) perdidas FROM mascotas WHERE estado='PERDIDA'`);
    const [[found]] = await pool.query(`SELECT COUNT(*) encontradas FROM mascotas WHERE estado='ENCONTRADA'`);
    const [[qr]] = await pool.query(`SELECT COUNT(*) qr_pendientes FROM identificaciones_qr WHERE estado='PENDIENTE'`);
    const [[activeReports]] = await pool.query(`SELECT COUNT(*) reportes_activos FROM reportes WHERE estado='ACTIVO'`);
    const [[resolvedReports]] = await pool.query(`SELECT COUNT(*) reportes_resueltos FROM reportes WHERE estado='RESUELTO'`);

    const [recentUsers] = await pool.query(`
      SELECT id, nombre, apellido, email, ci, estado, created_at
      FROM usuarios WHERE rol='USER'
      ORDER BY created_at DESC LIMIT 6
    `);

    res.json({ metrics: { ...users, ...pendingUsers, ...pets, ...lost, ...found, ...qr, ...activeReports, ...resolvedReports }, recentUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el dashboard.' });
  }
});

// Contadores para que cada sección del menú avise de las solicitudes que requieren atención.
router.get('/resumen-solicitudes', async (_req, res) => {
  try {
    const [[usuarios]] = await pool.query("SELECT COUNT(*) AS total FROM usuarios WHERE rol='USER' AND estado='PENDIENTE'");
    const [[qrs]] = await pool.query("SELECT COUNT(*) AS total FROM identificaciones_qr WHERE estado='PENDIENTE'");
    const [[retiros]] = await pool.query("SELECT COUNT(*) AS total FROM identificaciones_qr WHERE pickup_sucursal IS NOT NULL AND pickup_estado='PENDIENTE'");

    res.json({
      usuariosPendientes: Number(usuarios.total || 0),
      qrPendientes: Number(qrs.total || 0),
      retirosPendientes: Number(retiros.total || 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el resumen de solicitudes.' });
  }
});

router.get('/usuarios', async (req, res) => {
  try {
    const { search = '', estado = '' } = req.query;
    const params = [];
    let sql = `
      SELECT u.id, u.nombre, u.apellido, u.ci, u.email, u.telefono, u.foto, u.rol,
             u.estado, u.email_verificado, u.fecha_aprobacion, u.ultimo_acceso, u.created_at,
             a.nombre AS aprobador_nombre, a.apellido AS aprobador_apellido
      FROM usuarios u
      LEFT JOIN usuarios a ON a.id = u.aprobado_por
      WHERE u.rol='USER'
    `;
    if (search) {
      sql += ` AND (u.nombre LIKE ? OR u.apellido LIKE ? OR u.email LIKE ? OR u.ci LIKE ?)`;
      const q = `%${search}%`; params.push(q, q, q, q);
    }
    if (estado) { sql += ' AND u.estado = ?'; params.push(estado); }
    sql += ' ORDER BY u.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los usuarios.' });
  }
});

router.get('/usuarios/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, nombre, apellido, ci, email, telefono, foto, rol, estado,
             email_verificado, fecha_aprobacion, aprobado_por, ultimo_acceso, created_at, updated_at
      FROM usuarios WHERE id = ? LIMIT 1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Usuario no encontrado.' });

    const [pets] = await pool.query(`SELECT id, nombre, especie, raza, sexo, edad, vacunado, estado, foto FROM mascotas WHERE usuario_id = ? ORDER BY created_at DESC`, [req.params.id]);
    res.json({ ...rows[0], mascotas: pets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el usuario.' });
  }
});

router.patch('/usuarios/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body || {};
    const allowed = ['APROBADO', 'RECHAZADO', 'SUSPENDIDO'];
    if (!allowed.includes(estado)) return res.status(400).json({ message: 'Estado inválido.' });

    await pool.query(`UPDATE usuarios SET estado=?, fecha_aprobacion=CASE WHEN ?='APROBADO' THEN NOW() ELSE fecha_aprobacion END, aprobado_por=? WHERE id=? AND rol='USER'`, [estado, estado, req.user.id, req.params.id]);
    res.json({ message: `Usuario ${estado.toLowerCase()} correctamente.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar el usuario.' });
  }
});

router.get('/mascotas', async (req, res) => {
  try {
    const { search = '', estado = '' } = req.query;
    const params = [];
    let sql = `
      SELECT m.id, m.nombre, m.especie, m.raza, m.sexo, m.edad, m.foto, m.vacunado,
             m.caracteristicas, m.estado, m.created_at,
             u.id usuario_id, CONCAT(u.nombre,' ',u.apellido) propietario, u.ci, u.email, u.telefono
      FROM mascotas m
      INNER JOIN usuarios u ON u.id = m.usuario_id
      WHERE 1=1
    `;
    if (search) {
      sql += ` AND (m.nombre LIKE ? OR m.raza LIKE ? OR u.nombre LIKE ? OR u.apellido LIKE ? OR u.ci LIKE ?)`;
      const q = `%${search}%`; params.push(q, q, q, q, q);
    }
    if (estado) { sql += ' AND m.estado=?'; params.push(estado); }
    sql += ' ORDER BY m.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar las mascotas.' });
  }
});

router.get('/mascotas/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, CONCAT(u.nombre,' ',u.apellido) propietario, u.ci, u.email, u.telefono
      FROM mascotas m INNER JOIN usuarios u ON u.id=m.usuario_id WHERE m.id=? LIMIT 1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Mascota no encontrada.' });

    const [qrs] = await pool.query(`SELECT id, codigo, estado, archivo_qr, solicitado_at, aprobado_at FROM identificaciones_qr WHERE mascota_id=? ORDER BY created_at DESC`, [req.params.id]);
    const [reports] = await pool.query(`SELECT * FROM reportes WHERE mascota_id=? ORDER BY fecha_reporte DESC`, [req.params.id]);
    res.json({ ...rows[0], qrs, reportes: reports });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar la mascota.' });
  }
});

router.get('/qr', async (req, res) => {
  try {
    const { estado = '' } = req.query;
    const params = [];
    let sql = `
      SELECT q.id, q.codigo, q.estado, q.archivo_qr, q.solicitado_at, q.aprobado_at,
             q.pickup_sucursal, q.pickup_solicitado_at, q.pickup_estado,
             m.id mascota_id, m.nombre mascota, m.especie,
             CONCAT(u.nombre,' ',u.apellido) propietario, u.ci, u.email
      FROM identificaciones_qr q
      INNER JOIN mascotas m ON m.id=q.mascota_id
      INNER JOIN usuarios u ON u.id=m.usuario_id
      WHERE 1=1
    `;
    if (estado) { sql += ' AND q.estado=?'; params.push(estado); }
    sql += ' ORDER BY q.solicitado_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los QR.' });
  }
});

router.get('/notificaciones', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, tipo, titulo, mensaje, leida, fecha
       FROM notificaciones
       WHERE usuario_id=?
       ORDER BY fecha DESC, id DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
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

router.patch('/qr/:id/recogida-estado', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, pickup_sucursal, pickup_estado FROM identificaciones_qr WHERE id=? LIMIT 1',
      [req.params.id]
    );
    const qr = rows[0];
    if (!qr) return res.status(404).json({ message: 'Identificación QR no encontrada.' });
    if (!qr.pickup_sucursal) return res.status(409).json({ message: 'Esta identificación no tiene una solicitud de retiro en sucursal.' });
    if (qr.pickup_estado === 'ATENDIDO') return res.json({ message: 'La solicitud de retiro ya estaba marcada como atendida.', pickup_estado: 'ATENDIDO' });

    await pool.query("UPDATE identificaciones_qr SET pickup_estado='ATENDIDO' WHERE id=?", [req.params.id]);
    res.json({ message: 'Solicitud de retiro marcada como atendida.', pickup_estado: 'ATENDIDO' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar el estado del retiro.' });
  }
});

router.get('/qr/:id/imagen', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.id, q.codigo, q.estado, m.nombre mascota
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id=q.mascota_id
       WHERE q.id=? LIMIT 1`,
      [req.params.id]
    );
    const qr = rows[0];
    if (!qr) return res.status(404).json({ message: 'Identificación QR no encontrada.' });
    if (!['APROBADO', 'ACTIVO'].includes(qr.estado)) {
      return res.status(409).json({ message: 'El QR todavía no está aprobado.' });
    }
    const base = (process.env.PUBLIC_QR_BASE_URL || 'http://localhost:5173/qr').replace(/\/$/, '');
    const payload = `${base.replace(/\/$/, '')}/${encodeURIComponent(qr.codigo)}`;
    const qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'H', margin: 2, width: 700 });
    res.json({ id: qr.id, codigo: qr.codigo, mascota: qr.mascota, payload, qrDataUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo generar el archivo QR.' });
  }
});

function makeQrCode() {
  return `PRM-${randomBytes(5).toString('hex').toUpperCase()}`;
}

router.patch('/qr/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!['APROBADO', 'RECHAZADO', 'ACTIVO', 'DESACTIVADO'].includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido.' });
    }

    const [rows] = await pool.query('SELECT codigo FROM identificaciones_qr WHERE id=? LIMIT 1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Solicitud QR no encontrada.' });

    let codigo = rows[0].codigo;
    if (!codigo || codigo.startsWith('TEMP-')) codigo = makeQrCode();

    let archivoQr = null;
    if (estado === 'APROBADO' || estado === 'ACTIVO') {
      const folder = path.resolve('uploads/qr');
      await fs.mkdir(folder, { recursive: true });
      const filename = `${codigo}.png`;
      const filepath = path.join(folder, filename);
      await QRCode.toFile(filepath, `${(process.env.PUBLIC_QR_BASE_URL || 'http://localhost:5173/qr').replace(/\/$/, '')}/${encodeURIComponent(codigo)}`, { margin: 2, width: 600 });
      archivoQr = `/uploads/qr/${filename}`;
    }

    await pool.query(`UPDATE identificaciones_qr SET codigo=?, estado=?, archivo_qr=COALESCE(?, archivo_qr), aprobado_at=CASE WHEN ? IN ('APROBADO','ACTIVO') THEN NOW() ELSE aprobado_at END, aprobado_por=? WHERE id=?`, [codigo, estado, archivoQr, estado, req.user.id, req.params.id]);
    res.json({ message: `QR actualizado a ${estado.toLowerCase()}.`, codigo, archivoQr });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar el QR.' });
  }
});

router.get('/reportes', async (req, res) => {
  try {
    const { tipo = '', estado = '' } = req.query;
    const params = [];
    let sql = `
      SELECT r.id, r.tipo, r.fecha_reporte, r.descripcion, r.ubicacion, r.latitud, r.longitud,
             r.foto, r.estado, m.id mascota_id,
             COALESCE(r.nombre_mascota, m.nombre, 'Mascota') mascota,
             COALESCE(r.especie_mascota, m.especie, 'OTRO') especie,
             COALESCE(r.raza_mascota, m.raza) raza,
             CONCAT(u.nombre,' ',u.apellido) reportante, u.email
      FROM reportes r
      LEFT JOIN mascotas m ON m.id=r.mascota_id
      INNER JOIN usuarios u ON u.id=r.usuario_id
      WHERE 1=1
    `;
    if (tipo) { sql += ' AND r.tipo=?'; params.push(tipo); }
    if (estado) { sql += ' AND r.estado=?'; params.push(estado); }
    sql += ' ORDER BY r.fecha_reporte DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los reportes.' });
  }
});

router.patch('/reportes/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!['ACTIVO', 'RESUELTO', 'CERRADO'].includes(estado)) return res.status(400).json({ message: 'Estado inválido.' });
    const [result] = await pool.query('UPDATE reportes SET estado=? WHERE id=?', [estado, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Reporte no encontrado.' });
    res.json({ message: `Reporte actualizado a ${estado.toLowerCase()}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar el reporte.' });
  }
});

export default router;
