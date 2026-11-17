import { Router } from 'express';
import pool from '../db.js';
import {
  authenticate,
  requireActiveAccount,
  requireUser
} from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireActiveAccount, requireUser);

const NAME_RE = /^[\p{L}][\p{L}\s'-]{0,99}$/u;
const VALID_TYPES = ['PERDIDA', 'ENCONTRADA'];
const VALID_SPECIES = ['PERRO', 'GATO', 'OTRO'];
const VALID_SEXES = ['MACHO', 'HEMBRA'];
const VALID_REPORT_STATES = ['RESUELTO', 'CERRADO'];

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return '';

  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  return String(value).trim().slice(0, maxLength);
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    return NaN;
  }

  if (typeof value === 'string' && !value.trim()) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : NaN;
}

function validId(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : NaN;
}

function validImage(value) {
  if (!value) return true;

  return (
    /^https?:\/\/\S+$/i.test(value) ||
    /^\/uploads\/images\/[A-Za-z0-9._-]+$/.test(value)
  );
}

function schemaError(res) {
  return res.status(503).json({
    message: 'Falta aplicar la migración de Sprint 3. Ejecuta database/migration_sprint3_comunicacion_reportes.sql en MySQL.'
  });
}

function missingSchema(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

function validateCoordinates(latitud, longitud, res) {
  if (Number.isNaN(latitud) || Number.isNaN(longitud)) {
    res.status(400).json({
      message: 'Las coordenadas deben ser números válidos.'
    });
    return false;
  }

  if ((latitud === null) !== (longitud === null)) {
    res.status(400).json({
      message: 'Completa latitud y longitud, o deja ambos campos vacíos.'
    });
    return false;
  }

  if (latitud !== null && (latitud < -90 || latitud > 90)) {
    res.status(400).json({
      message: 'La latitud debe estar entre -90 y 90.'
    });
    return false;
  }

  if (longitud !== null && (longitud < -180 || longitud > 180)) {
    res.status(400).json({
      message: 'La longitud debe estar entre -180 y 180.'
    });
    return false;
  }

  return true;
}

async function broadcastReportNotification({
  excludeUserId,
  excludeAlso = [],
  type,
  reportId,
  petName,
  location,
  latitud,
  longitud
}) {
  const title = type === 'PERDIDA'
    ? 'Nueva mascota perdida'
    : 'Nueva mascota encontrada';

  const message =
    `${petName} · ${location || 'Ubicación no especificada'}. Abre Huellitas para ver el reporte #${reportId}.`;

  const excluded = [
    ...new Set([
      Number(excludeUserId),
      ...excludeAlso.map(Number)
    ].filter(Number.isSafeInteger))
  ];

  const notIn = excluded.map(() => '?').join(', ');

  const [admins] = await pool.query(
    `SELECT id
     FROM usuarios
     WHERE rol='ADMIN'
       AND id NOT IN (${notIn})`,
    excluded
  );

  let community = [];

  if (latitud !== null && longitud !== null) {
    const [nearby] = await pool.query(
      `SELECT p.usuario_id AS id
       FROM preferencias_alertas_ubicacion p
       INNER JOIN usuarios u ON u.id=p.usuario_id
       WHERE p.activo=TRUE
         AND u.rol='USER'
         AND u.estado='APROBADO'
         AND u.id NOT IN (${notIn})
         AND (
           6371 * ACOS(
             LEAST(1, GREATEST(-1,
               SIN(RADIANS(?)) * SIN(RADIANS(p.latitud)) +
               COS(RADIANS(?)) * COS(RADIANS(p.latitud)) *
               COS(RADIANS(p.longitud) - RADIANS(?))
             ))
           )
         ) <= p.radio_km`,
      [...excluded, latitud, latitud, longitud]
    );

    community = nearby;
  } else {
    const [allApproved] = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE id NOT IN (${notIn})
         AND (
           rol='ADMIN'
           OR (rol='USER' AND estado='APROBADO')
         )`,
      excluded
    );

    community = allApproved;
  }

  const recipients = [
    ...new Set([
      ...admins,
      ...community
    ].map((user) => Number(user.id)))
  ];

  if (!recipients.length) return;

  const values = recipients.map(() => '(?, ?, ?, ?)').join(', ');

  const params = recipients.flatMap((id) => [
    id,
    'REPORTE_MASCOTA',
    title,
    message
  ]);

  await pool.query(
    `INSERT INTO notificaciones
      (usuario_id, tipo, titulo, mensaje)
     VALUES ${values}`,
    params
  );
}

// ==========================================
// LISTAR REPORTES DEL USUARIO
// ==========================================

router.get('/reportes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        r.id,
        r.mascota_id,
        r.tipo,
        r.fecha_reporte,
        r.descripcion,
        r.ubicacion,
        r.latitud,
        r.longitud,
        r.foto,
        r.estado,
        r.nombre_mascota,
        r.especie_mascota,
        r.raza_mascota,
        r.sexo_mascota,
        r.edad_mascota,
        COALESCE(r.nombre_mascota, m.nombre) AS mascota,
        COALESCE(r.especie_mascota, m.especie) AS especie,
        COALESCE(r.raza_mascota, m.raza) AS raza,
        COALESCE(r.foto, m.foto) AS foto_mascota,
        CONCAT(u.nombre, ' ', u.apellido) AS reportante
       FROM reportes r
       LEFT JOIN mascotas m ON m.id=r.mascota_id
       INNER JOIN usuarios u ON u.id=r.usuario_id
       WHERE r.usuario_id=?
       ORDER BY r.fecha_reporte DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);

    console.error(error);

    res.status(500).json({
      message: 'No se pudieron cargar tus reportes.'
    });
  }
});

// ==========================================
// CREAR REPORTE DE MASCOTA
// ==========================================

router.post('/reportes', async (req, res) => {
  const tipo = cleanText(req.body?.tipo, 20).toUpperCase();

  const mascotaId = validId(req.body?.mascota_id);

  const nombre = cleanText(
    req.body?.nombre_mascota,
    100
  ).replace(/\s+/g, ' ');

  const especie = cleanText(
    req.body?.especie_mascota,
    20
  ).toUpperCase();

  const raza = cleanText(req.body?.raza_mascota, 100) || null;

  const sexo = cleanText(
    req.body?.sexo_mascota,
    20
  ).toUpperCase() || null;

  const edad = numberOrNull(req.body?.edad_mascota);

  const descripcion = cleanText(
    req.body?.descripcion,
    4000
  ) || null;

  const ubicacion = cleanText(
    req.body?.ubicacion,
    255
  ).replace(/\s+/g, ' ');

  const latitud = numberOrNull(req.body?.latitud);
  const longitud = numberOrNull(req.body?.longitud);

  const foto = cleanText(req.body?.foto, 500) || null;

  if (!VALID_TYPES.includes(tipo)) {
    return res.status(400).json({
      message: 'Selecciona pérdida o hallazgo.'
    });
  }

  if (Number.isNaN(mascotaId)) {
    return res.status(400).json({
      message: 'La mascota seleccionada no es válida.'
    });
  }

  if (!ubicacion) {
    return res.status(400).json({
      message: 'Indica la última ubicación conocida o el lugar del hallazgo.'
    });
  }

  if (!validateCoordinates(latitud, longitud, res)) {
    return;
  }

  if (!validImage(foto)) {
    return res.status(400).json({
      message: 'La fotografía debe ser una URL válida o una imagen cargada en Huellitas.'
    });
  }

  let pet = null;

  try {
    if (tipo === 'PERDIDA') {
      if (!mascotaId) {
        return res.status(400).json({
          message: 'Selecciona una de tus mascotas para reportarla como perdida.'
        });
      }

      const [pets] = await pool.query(
        `SELECT
          id,
          usuario_id,
          nombre,
          especie,
          raza,
          sexo,
          edad,
          foto,
          estado
         FROM mascotas
         WHERE id=? AND usuario_id=?
         LIMIT 1`,
        [mascotaId, req.user.id]
      );

      pet = pets[0];

      if (!pet) {
        return res.status(404).json({
          message: 'La mascota seleccionada no pertenece a tu cuenta.'
        });
      }

      const [active] = await pool.query(
        `SELECT id
         FROM reportes
         WHERE mascota_id=?
           AND tipo='PERDIDA'
           AND estado='ACTIVO'
         LIMIT 1`,
        [mascotaId]
      );

      if (active[0]) {
        return res.status(409).json({
          message: 'Esta mascota ya tiene un reporte de pérdida activo.',
          reporte_id: active[0].id
        });
      }
    } else if (mascotaId) {
      const [pets] = await pool.query(
        `SELECT
          id,
          usuario_id,
          nombre,
          especie,
          raza,
          sexo,
          edad,
          foto,
          estado
         FROM mascotas
         WHERE id=?
         LIMIT 1`,
        [mascotaId]
      );

      pet = pets[0];

      if (!pet) {
        return res.status(404).json({
          message: 'No se encontró la mascota asociada al hallazgo.'
        });
      }
    } else {
      if (!nombre) {
        return res.status(400).json({
          message: 'Escribe el nombre provisional o una identificación breve de la mascota encontrada.'
        });
      }

      if (!NAME_RE.test(nombre)) {
        return res.status(400).json({
          message: 'El nombre solo puede contener letras, espacios, guiones y apóstrofes.'
        });
      }

      if (!VALID_SPECIES.includes(especie)) {
        return res.status(400).json({
          message: 'Selecciona una especie válida.'
        });
      }

      if (sexo && !VALID_SEXES.includes(sexo)) {
        return res.status(400).json({
          message: 'Selecciona un sexo válido.'
        });
      }

      if (
        Number.isNaN(edad) ||
        (edad !== null && (!Number.isInteger(edad) || edad < 0 || edad > 40))
      ) {
        return res.status(400).json({
          message: 'La edad debe ser un entero entre 0 y 40.'
        });
      }
    }

    const petName = pet?.nombre || nombre;
    const petSpecies = pet?.especie || especie;
    const petBreed = pet?.raza || raza;
    const petSex = pet?.sexo || sexo;
    const petAge = pet?.edad ?? edad;
    const petPhoto = foto || pet?.foto || null;

    const [result] = await pool.query(
      `INSERT INTO reportes
       (
         mascota_id,
         usuario_id,
         tipo,
         descripcion,
         ubicacion,
         latitud,
         longitud,
         foto,
         nombre_mascota,
         especie_mascota,
         raza_mascota,
         sexo_mascota,
         edad_mascota,
         estado
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')`,
      [
        pet?.id || null,
        req.user.id,
        tipo,
        descripcion,
        ubicacion,
        latitud,
        longitud,
        petPhoto,
        petName,
        petSpecies,
        petBreed,
        petSex,
        petAge
      ]
    );

    if (tipo === 'PERDIDA' && pet?.id) {
      await pool.query(
        `UPDATE mascotas
         SET estado='PERDIDA'
         WHERE id=? AND usuario_id=?`,
        [pet.id, req.user.id]
      );
    } else if (
      tipo === 'ENCONTRADA' &&
      pet?.id &&
      pet.estado === 'PERDIDA'
    ) {
      await pool.query(
        `UPDATE mascotas
         SET estado='ENCONTRADA'
         WHERE id=? AND estado='PERDIDA'`,
        [pet.id]
      );
    }

    await broadcastReportNotification({
      excludeUserId: req.user.id,
      excludeAlso:
        tipo === 'ENCONTRADA' &&
        pet?.usuario_id &&
        Number(pet.usuario_id) !== Number(req.user.id)
          ? [pet.usuario_id]
          : [],
      type: tipo,
      reportId: result.insertId,
      petName,
      location: ubicacion,
      latitud,
      longitud
    });

    if (
      tipo === 'ENCONTRADA' &&
      pet?.usuario_id &&
      Number(pet.usuario_id) !== Number(req.user.id)
    ) {
      await pool.query(
        `INSERT INTO notificaciones
          (usuario_id, tipo, titulo, mensaje)
         VALUES (
           ?,
           'MASCOTA_ENCONTRADA',
           'Posible hallazgo de tu mascota',
           ?
         )`,
        [
          pet.usuario_id,
          `Se registró un hallazgo relacionado con ${petName} en ${ubicacion}. Revisa Huellitas (reporte #${result.insertId}).`
        ]
      );
    }

    res.status(201).json({
      message: tipo === 'PERDIDA'
        ? 'Aviso de mascota perdida publicado.'
        : 'Reporte de hallazgo publicado.',
      reporte_id: result.insertId
    });
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);

    console.error(error);

    res.status(500).json({
      message: 'No se pudo publicar el reporte.'
    });
  }
});

// ==========================================
// LISTAR AVISTAMIENTOS
// ==========================================

router.get('/reportes/:id/avistamientos', async (req, res) => {
  const reportId = validId(req.params.id);

  if (!reportId) {
    return res.status(400).json({
      message: 'El identificador del reporte no es válido.'
    });
  }

  try {
    const [reports] = await pool.query(
      `SELECT id
       FROM reportes
       WHERE id=?
         AND usuario_id=?
         AND tipo='PERDIDA'
       LIMIT 1`,
      [reportId, req.user.id]
    );

    if (!reports[0]) {
      return res.status(404).json({
        message: 'No se encontró un aviso de pérdida de tu cuenta.'
      });
    }

    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.reporte_id,
        a.ubicacion,
        a.latitud,
        a.longitud,
        a.descripcion,
        a.foto,
        a.created_at,
        CONCAT(u.nombre, ' ', LEFT(u.apellido, 1), '.') AS avistador
       FROM avistamientos a
       INNER JOIN usuarios u ON u.id=a.usuario_id
       WHERE a.reporte_id=?
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [reportId]
    );

    res.json(rows);
  } catch (error) {
    if (missingSchema(error)) {
      return res.status(503).json({
        message: 'Falta crear la tabla de avistamientos. Ejecuta database/migration_sprint3_avistamientos.sql.'
      });
    }

    console.error(error);

    res.status(500).json({
      message: 'No se pudieron cargar los avistamientos.'
    });
  }
});

// ==========================================
// REGISTRAR AVISTAMIENTO
// ==========================================

router.post('/reportes/:id/avistamientos', async (req, res) => {
  const reportId = validId(req.params.id);

  if (!reportId) {
    return res.status(400).json({
      message: 'El identificador del reporte no es válido.'
    });
  }

  const ubicacion = cleanText(
    req.body?.ubicacion,
    255
  ).replace(/\s+/g, ' ');

  const descripcion = cleanText(
    req.body?.descripcion,
    2000
  ) || null;

  const latitud = numberOrNull(req.body?.latitud);
  const longitud = numberOrNull(req.body?.longitud);

  const foto = cleanText(req.body?.foto, 500) || null;

  if (!ubicacion) {
    return res.status(400).json({
      message: 'Indica dónde viste a la mascota.'
    });
  }

  if (!validateCoordinates(latitud, longitud, res)) {
    return;
  }

  if (!validImage(foto)) {
    return res.status(400).json({
      message: 'La fotografía debe ser una URL válida o una imagen cargada en Huellitas.'
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT
        r.id,
        r.mascota_id,
        r.usuario_id,
        r.tipo,
        r.estado,
        COALESCE(m.nombre, 'Mascota') AS mascota
       FROM reportes r
       LEFT JOIN mascotas m ON m.id=r.mascota_id
       WHERE r.id=?
       LIMIT 1`,
      [reportId]
    );

    const report = rows[0];

    if (!report) {
      return res.status(404).json({
        message: 'No se encontró el aviso.'
      });
    }

    if (report.tipo !== 'PERDIDA' || report.estado !== 'ACTIVO') {
      return res.status(409).json({
        message: 'Solo puedes reportar avistamientos en avisos de pérdida activos.'
      });
    }

    if (Number(report.usuario_id) === Number(req.user.id)) {
      return res.status(409).json({
        message: 'El propietario no necesita registrar un avistamiento en su propio aviso.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO avistamientos
        (
          mascota_id,
          reporte_id,
          usuario_id,
          ubicacion,
          latitud,
          longitud,
          descripcion,
          foto
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report.mascota_id,
        report.id,
        req.user.id,
        ubicacion,
        latitud,
        longitud,
        descripcion,
        foto
      ]
    );

    await pool.query(
      `INSERT INTO notificaciones
        (usuario_id, tipo, titulo, mensaje)
       VALUES (
         ?,
         'AVISTAMIENTO',
         'Nuevo avistamiento de tu mascota',
         ?
       )`,
      [
        report.usuario_id,
        `Alguien informó haber visto a ${report.mascota} en ${ubicacion}. Revisa el aviso y contacta a la persona en Huellitas.`
      ]
    );

    res.status(201).json({
      message: 'Avistamiento enviado al propietario.',
      avistamiento_id: result.insertId
    });
  } catch (error) {
    if (missingSchema(error)) {
      return res.status(503).json({
        message: 'Falta crear la tabla de avistamientos. Ejecuta database/migration_sprint3_avistamientos.sql.'
      });
    }

    console.error(error);

    res.status(500).json({
      message: 'No se pudo registrar el avistamiento.'
    });
  }
});

// ==========================================
// ACTUALIZAR ESTADO DEL REPORTE
// ==========================================

router.patch('/reportes/:id/estado', async (req, res) => {
  const reportId = validId(req.params.id);

  const estado = cleanText(
    req.body?.estado,
    20
  ).toUpperCase();

  if (!reportId) {
    return res.status(400).json({
      message: 'El identificador del reporte no es válido.'
    });
  }

  if (!VALID_REPORT_STATES.includes(estado)) {
    return res.status(400).json({
      message: 'El estado debe ser RESUELTO o CERRADO.'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT
        id,
        mascota_id,
        tipo,
        estado
       FROM reportes
       WHERE id=?
         AND usuario_id=?
       LIMIT 1
       FOR UPDATE`,
      [reportId, req.user.id]
    );

    const report = rows[0];

    if (!report) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Reporte no encontrado en tu cuenta.'
      });
    }

    if (report.estado !== 'ACTIVO') {
      await connection.rollback();

      return res.status(409).json({
        message: 'El reporte ya no está activo.'
      });
    }

    await connection.query(
      'UPDATE reportes SET estado=? WHERE id=?',
      [estado, report.id]
    );

    if (
      report.mascota_id &&
      report.tipo === 'PERDIDA' &&
      estado === 'RESUELTO'
    ) {
      await connection.query(
        `UPDATE mascotas
         SET estado='EN_CASA'
         WHERE id=? AND usuario_id=?`,
        [report.mascota_id, req.user.id]
      );

      await connection.query(
        `UPDATE reportes
         SET estado='RESUELTO'
         WHERE mascota_id=?
           AND usuario_id=?
           AND tipo='PERDIDA'
           AND estado='ACTIVO'`,
        [report.mascota_id, req.user.id]
      );
    }

    await connection.commit();

    res.json({
      message:
        report.tipo === 'PERDIDA' && estado === 'RESUELTO'
          ? '¡Qué alegría! La mascota volvió a estar EN CASA y el aviso quedó resuelto.'
          : estado === 'RESUELTO'
            ? 'Caso resuelto correctamente.'
            : 'Reporte cerrado.'
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (missingSchema(error)) return schemaError(res);

    console.error(error);

    res.status(500).json({
      message: 'No se pudo actualizar el reporte.'
    });
  } finally {
    connection?.release();
  }
});

export default router;
