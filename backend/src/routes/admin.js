import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';

import pool from '../db.js';
import {
  authenticate,
  requireActiveAccount,
  requireAdmin
} from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireActiveAccount, requireAdmin);

// ======================================================
// CONFIGURACIÓN Y VALIDACIONES
// ======================================================

const USER_STATES = [
  'PENDIENTE',
  'APROBADO',
  'RECHAZADO',
  'SUSPENDIDO'
];

const PET_STATES = [
  'EN_CASA',
  'PERDIDA',
  'ENCONTRADA'
];

const QR_STATES = [
  'PENDIENTE',
  'APROBADO',
  'RECHAZADO',
  'ACTIVO',
  'DESACTIVADO'
];

const QR_ADMIN_STATES = [
  'APROBADO',
  'RECHAZADO',
  'ACTIVO',
  'DESACTIVADO'
];

const REPORT_TYPES = [
  'PERDIDA',
  'ENCONTRADA'
];

const REPORT_STATES = [
  'ACTIVO',
  'RESUELTO',
  'CERRADO'
];

const MAX_BIGINT = 18446744073709551615n;

function parseId(value) {
  const id = String(value ?? '').trim();

  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }

  try {
    if (BigInt(id) > MAX_BIGINT) {
      return null;
    }
  } catch {
    return null;
  }

  return id;
}

function parseSearch(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new Error('El parámetro de búsqueda es inválido.');
  }

  return value.trim().slice(0, 100);
}

function parseFilter(value, allowed, fieldName) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (
    typeof value !== 'string' ||
    !allowed.includes(value)
  ) {
    throw new Error(`El filtro ${fieldName} es inválido.`);
  }

  return value;
}

function validateQrCode(code) {
  return (
    typeof code === 'string' &&
    /^[A-Za-z0-9_-]{4,100}$/.test(code)
  );
}

function makeQrCode() {
  return `PRM-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function getQrBaseUrl() {
  const base =
    process.env.PUBLIC_QR_BASE_URL ||
    'http://localhost:5173/qr';

  return base.replace(/\/+$/, '');
}

function sendServerError(res, error, message) {
  console.error(error);

  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'Ya existe un registro con esos datos.'
    });
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({
      message: 'No se puede realizar esta operación porque existen registros relacionados.'
    });
  }

  return res.status(500).json({ message });
}

function sendValidationError(res, error) {
  if (error.message?.includes('inválido')) {
    return res.status(400).json({
      message: error.message
    });
  }

  return null;
}

// ======================================================
// DASHBOARD
// ======================================================

router.get('/dashboard', async (_req, res) => {
  try {
    const [
      usersRows,
      pendingUsersRows,
      petsRows,
      lostRows,
      foundRows,
      qrRows,
      activeReportsRows,
      resolvedReportsRows
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total_usuarios
        FROM usuarios
        WHERE rol = 'USER'
      `),

      pool.query(`
        SELECT COUNT(*) AS pendientes
        FROM usuarios
        WHERE rol = 'USER'
          AND estado = 'PENDIENTE'
      `),

      pool.query(`
        SELECT COUNT(*) AS total_mascotas
        FROM mascotas
      `),

      pool.query(`
        SELECT COUNT(*) AS perdidas
        FROM mascotas
        WHERE estado = 'PERDIDA'
      `),

      pool.query(`
        SELECT COUNT(*) AS encontradas
        FROM mascotas
        WHERE estado = 'ENCONTRADA'
      `),

      pool.query(`
        SELECT COUNT(*) AS qr_pendientes
        FROM identificaciones_qr
        WHERE estado = 'PENDIENTE'
      `),

      pool.query(`
        SELECT COUNT(*) AS reportes_activos
        FROM reportes
        WHERE estado = 'ACTIVO'
      `),

      pool.query(`
        SELECT COUNT(*) AS reportes_resueltos
        FROM reportes
        WHERE estado = 'RESUELTO'
      `)
    ]);

    const [recentUsers] = await pool.query(`
      SELECT
        id,
        nombre,
        apellido,
        email,
        ci,
        estado,
        created_at
      FROM usuarios
      WHERE rol = 'USER'
      ORDER BY created_at DESC
      LIMIT 6
    `);

    const metrics = {
      ...usersRows[0][0],
      ...pendingUsersRows[0][0],
      ...petsRows[0][0],
      ...lostRows[0][0],
      ...foundRows[0][0],
      ...qrRows[0][0],
      ...activeReportsRows[0][0],
      ...resolvedReportsRows[0][0]
    };

    for (const key of Object.keys(metrics)) {
      metrics[key] = Number(metrics[key] || 0);
    }

    res.json({
      metrics,
      recentUsers
    });

  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo cargar el dashboard.'
    );
  }
});

// ======================================================
// RESUMEN DE SOLICITUDES
// ======================================================

router.get('/resumen-solicitudes', async (_req, res) => {
  try {
    const [
      [usuarios],
      [qrs],
      [retiros]
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total
        FROM usuarios
        WHERE rol = 'USER'
          AND estado = 'PENDIENTE'
      `),

      pool.query(`
        SELECT COUNT(*) AS total
        FROM identificaciones_qr
        WHERE estado = 'PENDIENTE'
      `),

      pool.query(`
        SELECT COUNT(*) AS total
        FROM identificaciones_qr
        WHERE pickup_sucursal IS NOT NULL
          AND pickup_estado = 'PENDIENTE'
      `)
    ]);

    res.json({
      usuariosPendientes: Number(usuarios.total || 0),
      qrPendientes: Number(qrs.total || 0),
      retirosPendientes: Number(retiros.total || 0)
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo cargar el resumen de solicitudes.'
    );
  }
});

// ======================================================
// USUARIOS
// ======================================================

router.get('/usuarios', async (req, res) => {
  try {
    const search = parseSearch(req.query.search);

    const estado = parseFilter(
      req.query.estado,
      USER_STATES,
      'estado'
    );

    const params = [];

    let sql = `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.ci,
        u.email,
        u.telefono,
        u.foto,
        u.rol,
        u.estado,
        u.email_verificado,
        u.fecha_aprobacion,
        u.ultimo_acceso,
        u.created_at,
        a.nombre AS aprobador_nombre,
        a.apellido AS aprobador_apellido
      FROM usuarios u
      LEFT JOIN usuarios a
        ON a.id = u.aprobado_por
      WHERE u.rol = 'USER'
    `;

    if (search) {
      sql += `
        AND (
          u.nombre LIKE ?
          OR u.apellido LIKE ?
          OR u.email LIKE ?
          OR u.ci LIKE ?
        )
      `;

      const q = `%${search}%`;

      params.push(q, q, q, q);
    }

    if (estado) {
      sql += ' AND u.estado = ?';
      params.push(estado);
    }

    sql += ' ORDER BY u.created_at DESC';

    const [rows] = await pool.query(sql, params);

    res.json(rows);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    sendServerError(
      res,
      error,
      'No se pudieron cargar los usuarios.'
    );
  }
});

router.get('/usuarios/:id', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de usuario inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        nombre,
        apellido,
        ci,
        email,
        telefono,
        foto,
        rol,
        estado,
        email_verificado,
        fecha_aprobacion,
        aprobado_por,
        ultimo_acceso,
        created_at,
        updated_at
      FROM usuarios
      WHERE id = ?
      LIMIT 1
    `, [id]);

    if (!rows[0]) {
      return res.status(404).json({
        message: 'Usuario no encontrado.'
      });
    }

    const [pets] = await pool.query(`
      SELECT
        id,
        nombre,
        especie,
        raza,
        sexo,
        edad,
        vacunado,
        estado,
        foto
      FROM mascotas
      WHERE usuario_id = ?
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      ...rows[0],
      mascotas: pets
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo cargar el usuario.'
    );
  }
});

router.patch('/usuarios/:id/estado', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de usuario inválido.'
    });
  }

  const { estado } = req.body || {};

  if (!USER_STATES.includes(estado)) {
    return res.status(400).json({
      message: 'Estado de usuario inválido.'
    });
  }

  if (String(req.user.id) === id) {
    return res.status(409).json({
      message: 'No puedes modificar el estado de tu propia cuenta.'
    });
  }

  try {
    const [users] = await pool.query(`
      SELECT id
      FROM usuarios
      WHERE id = ?
        AND rol = 'USER'
      LIMIT 1
    `, [id]);

    if (!users[0]) {
      return res.status(404).json({
        message: 'Usuario no encontrado.'
      });
    }

    await pool.query(`
      UPDATE usuarios
      SET
        estado = ?,
        fecha_aprobacion = CASE
          WHEN ? = 'APROBADO' THEN NOW()
          ELSE fecha_aprobacion
        END,
        aprobado_por = CASE
          WHEN ? = 'APROBADO' THEN ?
          ELSE aprobado_por
        END
      WHERE id = ?
        AND rol = 'USER'
    `, [
      estado,
      estado,
      estado,
      req.user.id,
      id
    ]);

    res.json({
      message: `Usuario ${estado.toLowerCase()} correctamente.`,
      estado
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo actualizar el usuario.'
    );
  }
});

// ======================================================
// MASCOTAS
// ======================================================

router.get('/mascotas', async (req, res) => {
  try {
    const search = parseSearch(req.query.search);

    const estado = parseFilter(
      req.query.estado,
      PET_STATES,
      'estado'
    );

    const params = [];

    let sql = `
      SELECT
        m.id,
        m.nombre,
        m.especie,
        m.raza,
        m.sexo,
        m.edad,
        m.foto,
        m.vacunado,
        m.caracteristicas,
        m.estado,
        m.created_at,
        u.id AS usuario_id,
        CONCAT(u.nombre, ' ', u.apellido) AS propietario,
        u.ci,
        u.email,
        u.telefono
      FROM mascotas m
      INNER JOIN usuarios u
        ON u.id = m.usuario_id
      WHERE 1 = 1
    `;

    if (search) {
      sql += `
        AND (
          m.nombre LIKE ?
          OR m.raza LIKE ?
          OR u.nombre LIKE ?
          OR u.apellido LIKE ?
          OR u.ci LIKE ?
        )
      `;

      const q = `%${search}%`;

      params.push(q, q, q, q, q);
    }

    if (estado) {
      sql += ' AND m.estado = ?';
      params.push(estado);
    }

    sql += ' ORDER BY m.created_at DESC';

    const [rows] = await pool.query(sql, params);

    res.json(rows);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    sendServerError(
      res,
      error,
      'No se pudieron cargar las mascotas.'
    );
  }
});

router.get('/mascotas/:id', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de mascota inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        m.*,
        CONCAT(u.nombre, ' ', u.apellido) AS propietario,
        u.ci,
        u.email,
        u.telefono
      FROM mascotas m
      INNER JOIN usuarios u
        ON u.id = m.usuario_id
      WHERE m.id = ?
      LIMIT 1
    `, [id]);

    if (!rows[0]) {
      return res.status(404).json({
        message: 'Mascota no encontrada.'
      });
    }

    const [qrs] = await pool.query(`
      SELECT
        id,
        codigo,
        estado,
        archivo_qr,
        pickup_sucursal,
        pickup_solicitado_at,
        pickup_estado,
        solicitado_at,
        aprobado_at
      FROM identificaciones_qr
      WHERE mascota_id = ?
      ORDER BY created_at DESC
    `, [id]);

    const [reports] = await pool.query(`
      SELECT *
      FROM reportes
      WHERE mascota_id = ?
      ORDER BY fecha_reporte DESC
    `, [id]);

    const [sightings] = await pool.query(`
      SELECT *
      FROM avistamientos
      WHERE mascota_id = ?
      ORDER BY fecha_avistamiento DESC
    `, [id]);

    res.json({
      ...rows[0],
      qrs,
      reportes: reports,
      avistamientos: sightings
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo cargar la mascota.'
    );
  }
});

// ======================================================
// ELIMINACIÓN SEGURA DE MASCOTAS
// ======================================================

router.delete('/mascotas/:id', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de mascota inválido.'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    await connection.beginTransaction();

    const [pets] = await connection.query(`
      SELECT id, nombre
      FROM mascotas
      WHERE id = ?
      FOR UPDATE
    `, [id]);

    if (!pets[0]) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Mascota no encontrada.'
      });
    }

    const [[qrCount]] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM identificaciones_qr
      WHERE mascota_id = ?
    `, [id]);

    const [[reportCount]] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM reportes
      WHERE mascota_id = ?
    `, [id]);

    const [[sightingCount]] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM avistamientos
      WHERE mascota_id = ?
    `, [id]);

    const dependencias = {
      qr: Number(qrCount.total),
      reportes: Number(reportCount.total),
      avistamientos: Number(sightingCount.total)
    };

    if (
      dependencias.qr > 0 ||
      dependencias.reportes > 0 ||
      dependencias.avistamientos > 0
    ) {
      await connection.rollback();

      return res.status(409).json({
        message: 'No se puede eliminar esta mascota porque tiene registros relacionados. Se debe conservar su historial.',
        dependencias
      });
    }

    // Las conversaciones tienen ON DELETE SET NULL.
    // Se conserva su historial y sus mensajes.

    const [result] = await connection.query(`
      DELETE FROM mascotas
      WHERE id = ?
    `, [id]);

    if (!result.affectedRows) {
      await connection.rollback();

      return res.status(404).json({
        message: 'No se pudo encontrar la mascota para eliminar.'
      });
    }

    await connection.commit();

    res.json({
      message: 'Mascota eliminada correctamente.',
      id
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'No se puede eliminar la mascota porque existen registros relacionados.'
      });
    }

    sendServerError(
      res,
      error,
      'No se pudo eliminar la mascota.'
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ======================================================
// IDENTIFICACIONES QR
// ======================================================

router.get('/qr', async (req, res) => {
  try {
    const estado = parseFilter(
      req.query.estado,
      QR_STATES,
      'estado'
    );

    const params = [];

    let sql = `
      SELECT
        q.id,
        q.codigo,
        q.estado,
        q.archivo_qr,
        q.solicitado_at,
        q.aprobado_at,
        q.pickup_sucursal,
        q.pickup_solicitado_at,
        q.pickup_estado,
        m.id AS mascota_id,
        m.nombre AS mascota,
        m.especie,
        CONCAT(u.nombre, ' ', u.apellido) AS propietario,
        u.ci,
        u.email
      FROM identificaciones_qr q
      INNER JOIN mascotas m
        ON m.id = q.mascota_id
      INNER JOIN usuarios u
        ON u.id = m.usuario_id
      WHERE 1 = 1
    `;

    if (estado) {
      sql += ' AND q.estado = ?';
      params.push(estado);
    }

    sql += ' ORDER BY q.solicitado_at DESC';

    const [rows] = await pool.query(sql, params);

    res.json(rows);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    sendServerError(
      res,
      error,
      'No se pudieron cargar los QR.'
    );
  }
});

// ======================================================
// NOTIFICACIONES DEL ADMINISTRADOR
// ======================================================

router.get('/notificaciones', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        tipo,
        titulo,
        mensaje,
        leida,
        fecha
      FROM notificaciones
      WHERE usuario_id = ?
      ORDER BY fecha DESC, id DESC
      LIMIT 50
    `, [req.user.id]);

    res.json(rows);
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudieron cargar las notificaciones.'
    );
  }
});

router.patch('/notificaciones/:id/leida', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de notificación inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT id
      FROM notificaciones
      WHERE id = ?
        AND usuario_id = ?
      LIMIT 1
    `, [id, req.user.id]);

    if (!rows[0]) {
      return res.status(404).json({
        message: 'Notificación no encontrada.'
      });
    }

    await pool.query(`
      UPDATE notificaciones
      SET leida = TRUE
      WHERE id = ?
        AND usuario_id = ?
    `, [id, req.user.id]);

    res.json({
      message: 'Notificación marcada como leída.'
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo actualizar la notificación.'
    );
  }
});

// ======================================================
// SOLICITUDES DE RETIRO QR
// ======================================================

router.patch('/qr/:id/recogida-estado', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador QR inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        pickup_sucursal,
        pickup_estado
      FROM identificaciones_qr
      WHERE id = ?
      LIMIT 1
    `, [id]);

    const qr = rows[0];

    if (!qr) {
      return res.status(404).json({
        message: 'Identificación QR no encontrada.'
      });
    }

    if (!qr.pickup_sucursal) {
      return res.status(409).json({
        message: 'Esta identificación no tiene una solicitud de retiro en sucursal.'
      });
    }

    if (qr.pickup_estado === 'ATENDIDO') {
      return res.json({
        message: 'La solicitud de retiro ya estaba marcada como atendida.',
        pickup_estado: 'ATENDIDO'
      });
    }

    if (qr.pickup_estado !== 'PENDIENTE') {
      return res.status(409).json({
        message: 'La solicitud de retiro no se encuentra pendiente.'
      });
    }

    await pool.query(`
      UPDATE identificaciones_qr
      SET pickup_estado = 'ATENDIDO'
      WHERE id = ?
        AND pickup_estado = 'PENDIENTE'
    `, [id]);

    res.json({
      message: 'Solicitud de retiro marcada como atendida.',
      pickup_estado: 'ATENDIDO'
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo actualizar el estado del retiro.'
    );
  }
});

// ======================================================
// GENERAR IMAGEN QR
// ======================================================

router.get('/qr/:id/imagen', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador QR inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        q.id,
        q.codigo,
        q.estado,
        m.nombre AS mascota
      FROM identificaciones_qr q
      INNER JOIN mascotas m
        ON m.id = q.mascota_id
      WHERE q.id = ?
      LIMIT 1
    `, [id]);

    const qr = rows[0];

    if (!qr) {
      return res.status(404).json({
        message: 'Identificación QR no encontrada.'
      });
    }

    if (!['APROBADO', 'ACTIVO'].includes(qr.estado)) {
      return res.status(409).json({
        message: 'El QR todavía no está aprobado.'
      });
    }

    if (!validateQrCode(qr.codigo)) {
      return res.status(409).json({
        message: 'El código QR almacenado no tiene un formato válido.'
      });
    }

    const payload =
      `${getQrBaseUrl()}/${encodeURIComponent(qr.codigo)}`;

    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 700
    });

    res.json({
      id: qr.id,
      codigo: qr.codigo,
      mascota: qr.mascota,
      payload,
      qrDataUrl
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo generar la imagen QR.'
    );
  }
});

// ======================================================
// ACTUALIZAR ESTADO QR
// ======================================================

router.patch('/qr/:id/estado', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador QR inválido.'
    });
  }

  const { estado } = req.body || {};

  if (!QR_ADMIN_STATES.includes(estado)) {
    return res.status(400).json({
      message: 'Estado QR inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        codigo,
        estado
      FROM identificaciones_qr
      WHERE id = ?
      LIMIT 1
    `, [id]);

    const currentQr = rows[0];

    if (!currentQr) {
      return res.status(404).json({
        message: 'Solicitud QR no encontrada.'
      });
    }

    let codigo = currentQr.codigo;

    if (!codigo || codigo.startsWith('TEMP-')) {
      let unique = false;

      for (let attempt = 0; attempt < 5; attempt++) {
        codigo = makeQrCode();

        const [existing] = await pool.query(`
          SELECT id
          FROM identificaciones_qr
          WHERE codigo = ?
          LIMIT 1
        `, [codigo]);

        if (!existing[0]) {
          unique = true;
          break;
        }
      }

      if (!unique) {
        return res.status(500).json({
          message: 'No se pudo generar un código QR único.'
        });
      }
    }

    if (!validateQrCode(codigo)) {
      return res.status(409).json({
        message: 'El código QR actual no tiene un formato válido.'
      });
    }

    let archivoQr = null;

    if (estado === 'APROBADO' || estado === 'ACTIVO') {
      const folder = path.resolve('uploads/qr');

      await fs.mkdir(folder, {
        recursive: true
      });

      const filename = `${codigo}.png`;
      const filepath = path.join(folder, filename);

      const payload =
        `${getQrBaseUrl()}/${encodeURIComponent(codigo)}`;

      await QRCode.toFile(filepath, payload, {
        margin: 2,
        width: 600,
        errorCorrectionLevel: 'H'
      });

      archivoQr = `/uploads/qr/${filename}`;
    }

    await pool.query(`
      UPDATE identificaciones_qr
      SET
        codigo = ?,
        estado = ?,
        archivo_qr = COALESCE(?, archivo_qr),
        aprobado_at = CASE
          WHEN ? IN ('APROBADO', 'ACTIVO')
          THEN COALESCE(aprobado_at, NOW())
          ELSE aprobado_at
        END,
        aprobado_por = CASE
          WHEN ? IN ('APROBADO', 'ACTIVO')
          THEN ?
          ELSE aprobado_por
        END
      WHERE id = ?
    `, [
      codigo,
      estado,
      archivoQr,
      estado,
      estado,
      req.user.id,
      id
    ]);

    res.json({
      message: `QR actualizado a ${estado.toLowerCase()}.`,
      codigo,
      archivoQr
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo actualizar el QR.'
    );
  }
});

// ======================================================
// REPORTES
// ======================================================

router.get('/reportes', async (req, res) => {
  try {
    const tipo = parseFilter(
      req.query.tipo,
      REPORT_TYPES,
      'tipo'
    );

    const estado = parseFilter(
      req.query.estado,
      REPORT_STATES,
      'estado'
    );

    const params = [];

    let sql = `
      SELECT
        r.id,
        r.tipo,
        r.fecha_reporte,
        r.descripcion,
        r.ubicacion,
        r.latitud,
        r.longitud,
        r.foto,
        r.estado,
        r.mascota_id,

        COALESCE(
          NULLIF(r.nombre_mascota, ''),
          m.nombre,
          'Mascota'
        ) AS mascota,

        COALESCE(
          NULLIF(r.especie_mascota, ''),
          m.especie,
          'OTRO'
        ) AS especie,

        COALESCE(
          NULLIF(r.raza_mascota, ''),
          m.raza
        ) AS raza,

        r.sexo_mascota,
        r.edad_mascota,

        CONCAT(u.nombre, ' ', u.apellido) AS reportante,
        u.email

      FROM reportes r

      LEFT JOIN mascotas m
        ON m.id = r.mascota_id

      INNER JOIN usuarios u
        ON u.id = r.usuario_id

      WHERE 1 = 1
    `;

    if (tipo) {
      sql += ' AND r.tipo = ?';
      params.push(tipo);
    }

    if (estado) {
      sql += ' AND r.estado = ?';
      params.push(estado);
    }

    sql += ' ORDER BY r.fecha_reporte DESC';

    const [rows] = await pool.query(sql, params);

    res.json(rows);
  } catch (error) {
    if (sendValidationError(res, error)) return;

    sendServerError(
      res,
      error,
      'No se pudieron cargar los reportes.'
    );
  }
});

router.patch('/reportes/:id/estado', async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de reporte inválido.'
    });
  }

  const { estado } = req.body || {};

  if (!REPORT_STATES.includes(estado)) {
    return res.status(400).json({
      message: 'Estado de reporte inválido.'
    });
  }

  try {
    const [rows] = await pool.query(`
      SELECT id
      FROM reportes
      WHERE id = ?
      LIMIT 1
    `, [id]);

    if (!rows[0]) {
      return res.status(404).json({
        message: 'Reporte no encontrado.'
      });
    }

    await pool.query(`
      UPDATE reportes
      SET estado = ?
      WHERE id = ?
    `, [estado, id]);

    res.json({
      message: `Reporte actualizado a ${estado.toLowerCase()}.`,
      estado
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      'No se pudo actualizar el reporte.'
    );
  }
});

export default router;
