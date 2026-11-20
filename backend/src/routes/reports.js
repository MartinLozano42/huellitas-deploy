import { Router } from 'express';
import pool from '../db.js';
import {
  authenticate,
  requireActiveAccount,
  requireUser
} from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireActiveAccount, requireUser);

// ==========================================
// CONSTANTES Y VALIDACIONES
// ==========================================

const VALID_TYPES = ['PERDIDA', 'ENCONTRADA'];
const VALID_SPECIES = ['PERRO', 'GATO', 'OTRO'];
const VALID_SEXES = ['MACHO', 'HEMBRA'];
const VALID_REPORT_STATES = ['RESUELTO', 'CERRADO'];

const NAME_RE = /^[\p{L}][\p{L}\s'-]{0,99}$/u;
const BREED_RE = /^[\p{L}][\p{L}\s'().-]{0,99}$/u;

const LOCATION_RE =
  /^[\p{L}\p{N}][\p{L}\p{N}\s.,#°ºª'()/\-]{1,254}$/u;

const COORDINATE_RE = /^-?(?:\d{1,3})(?:\.\d{1,8})?$/;

const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const DESCRIPTION_RE = /[\p{L}\p{N}]/u;

// Normaliza Unicode, espacios y caracteres invisibles.
// No elimina tildes, ñ, apóstrofes ni guiones válidos.
function normalizeText(value) {
  if (typeof value !== 'string') return null;

  return value
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readText(value, maxLength, options = {}) {
  const {
    optional = false,
    allowEmpty = false
  } = options;

  if (value === null || value === undefined) {
    return optional ? { value: null } : { error: 'Este campo es obligatorio.' };
  }

  if (typeof value !== 'string') {
    return { error: 'El formato del campo no es válido.' };
  }

  const normalized = normalizeText(value);

  if (normalized === null) {
    return { error: 'El formato del campo no es válido.' };
  }

  if (!normalized) {
    if (optional || allowEmpty) {
      return { value: null };
    }

    return { error: 'Este campo es obligatorio.' };
  }

  if (CONTROL_CHAR_RE.test(normalized)) {
    return { error: 'El campo contiene caracteres no permitidos.' };
  }

  if (normalized.length > maxLength) {
    return {
      error: `El campo no puede superar los ${maxLength} caracteres.`
    };
  }

  return { value: normalized };
}

function readEnum(value, allowedValues, options = {}) {
  const { optional = false } = options;

  if (value === null || value === undefined || value === '') {
    return optional
      ? { value: null }
      : { error: 'Selecciona una opción válida.' };
  }

  if (typeof value !== 'string') {
    return { error: 'La opción seleccionada no es válida.' };
  }

  const normalized = value.trim().toUpperCase();

  if (!allowedValues.includes(normalized)) {
    return { error: 'La opción seleccionada no es válida.' };
  }

  return { value: normalized };
}

function readId(value, options = {}) {
  const { optional = false } = options;

  if (value === null || value === undefined || value === '') {
    return optional
      ? { value: null }
      : { error: 'El identificador es obligatorio.' };
  }

  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return { error: 'El identificador no es válido.' };
  }

  const text = String(value).trim();

  if (!/^[1-9]\d*$/.test(text)) {
    return { error: 'El identificador debe ser un entero positivo.' };
  }

  const id = Number(text);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return { error: 'El identificador no es válido.' };
  }

  return { value: id };
}

function readAge(value, options = {}) {
  const { optional = true } = options;

  if (value === null || value === undefined || value === '') {
    return optional
      ? { value: null }
      : { error: 'Indica la edad de la mascota.' };
  }

  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return { error: 'La edad debe ser un número entero.' };
  }

  const text = String(value).trim();

  if (!/^(0|[1-9]\d*)$/.test(text)) {
    return { error: 'La edad debe ser un número entero.' };
  }

  const age = Number(text);

  if (!Number.isSafeInteger(age) || age < 0 || age > 40) {
    return { error: 'La edad debe estar entre 0 y 40 años.' };
  }

  return { value: age };
}

function readCoordinate(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return { value: null };
  }

  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return { error: `${fieldName} no es válida.` };
  }

  const text = String(value).trim();

  if (!COORDINATE_RE.test(text)) {
    return {
      error: `${fieldName} debe ser un número decimal válido.`
    };
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return { error: `${fieldName} no es válida.` };
  }

  return { value: number };
}

function readDescription(value, maxLength, options = {}) {
  const { optional = true } = options;

  const result = readText(value, maxLength, { optional });

  if (result.error) return result;

  if (result.value === null) {
    return { value: null };
  }

  if (!DESCRIPTION_RE.test(result.value)) {
    return {
      error: 'La descripción debe contener letras o números, no solamente símbolos.'
    };
  }

  return result;
}

function readName(value, options = {}) {
  const { optional = false } = options;

  const result = readText(value, 100, { optional });

  if (result.error || result.value === null) {
    return result;
  }

  if (!NAME_RE.test(result.value)) {
    return {
      error: 'El nombre solo puede contener letras, espacios, guiones y apóstrofes.'
    };
  }

  return result;
}

function readBreed(value, options = {}) {
  const { optional = true } = options;

  const result = readText(value, 100, { optional });

  if (result.error || result.value === null) {
    return result;
  }

  if (!BREED_RE.test(result.value)) {
    return {
      error: 'La raza debe contener letras y puede incluir espacios, guiones, apóstrofes o paréntesis.'
    };
  }

  return result;
}

function readLocation(value) {
  const result = readText(value, 255);

  if (result.error) return result;

  if (result.value.length < 3 || !LOCATION_RE.test(result.value)) {
    return {
      error: 'La ubicación debe tener al menos 3 caracteres y contener una dirección válida.'
    };
  }

  return result;
}

function readImage(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null };
  }

  if (typeof value !== 'string') {
    return { error: 'La fotografía no tiene un formato válido.' };
  }

  const image = value.trim();

  if (!image || image.length > 500) {
    return { error: 'La dirección de la fotografía no es válida.' };
  }

  if (/^\/uploads\/images\/[A-Za-z0-9._-]+$/.test(image)) {
    return { value: image };
  }

  try {
    const url = new URL(image);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return { error: 'La fotografía debe ser una URL HTTP o HTTPS válida.' };
    }

    return { value: url.toString() };
  } catch {
    return {
      error: 'La fotografía debe ser una URL válida o una imagen cargada en Huellitas.'
    };
  }
}

function validateCoordinates(latitud, longitud, res) {
  if (latitud.error || longitud.error) {
    return res.status(400).json({
      message: latitud.error || longitud.error
    });
  }

  if ((latitud.value === null) !== (longitud.value === null)) {
    return res.status(400).json({
      message: 'Completa latitud y longitud, o deja ambos campos vacíos.'
    });
  }

  if (
    latitud.value !== null &&
    (latitud.value < -90 || latitud.value > 90)
  ) {
    return res.status(400).json({
      message: 'La latitud debe estar entre -90 y 90.'
    });
  }

  if (
    longitud.value !== null &&
    (longitud.value < -180 || longitud.value > 180)
  ) {
    return res.status(400).json({
      message: 'La longitud debe estar entre -180 y 180.'
    });
  }

  return true;
}

function schemaError(res) {
  return res.status(503).json({
    message: 'Falta aplicar la migración de Sprint 3. Revisa el esquema de la base de datos.'
  });
}

function missingSchema(error) {
  return [
    'ER_NO_SUCH_TABLE',
    'ER_BAD_FIELD_ERROR'
  ].includes(error?.code);
}

// ==========================================
// NOTIFICACIONES DE REPORTES
// ==========================================

async function broadcastReportNotification({
  excludeUserId,
  excludeAlso = [],
  type,
  reportId,
  petName,
  location
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

  const [recipients] = await pool.query(
    `SELECT id
     FROM usuarios
     WHERE id NOT IN (${notIn})
       AND (
         rol = 'ADMIN'
         OR (rol = 'USER' AND estado = 'APROBADO')
       )`,
    excluded
  );

  if (!recipients.length) return;

  const values = recipients.map(() => '(?, ?, ?, ?)').join(', ');

  const params = recipients.flatMap((user) => [
    user.id,
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

  console.log(
    `[NOTIFICACIONES] Reporte #${reportId}: ${recipients.length} destinatarios.`
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

    return res.json(rows);
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);

    console.error(error);

    return res.status(500).json({
      message: 'No se pudieron cargar tus reportes.'
    });
  }
});

// ==========================================
// CREAR REPORTE DE MASCOTA
// ==========================================

router.post('/reportes', async (req, res) => {
  const body = req.body || {};

  const tipoResult = readEnum(body.tipo, VALID_TYPES);
  const mascotaIdResult = readId(body.mascota_id, { optional: true });

  const nombreResult = readName(body.nombre_mascota, { optional: true });
  const especieResult = readEnum(body.especie_mascota, VALID_SPECIES, {
    optional: true
  });
  const razaResult = readBreed(body.raza_mascota);
  const sexoResult = readEnum(body.sexo_mascota, VALID_SEXES, {
    optional: true
  });
  const edadResult = readAge(body.edad_mascota);

  const descripcionResult = readDescription(body.descripcion, 4000);
  const ubicacionResult = readLocation(body.ubicacion);

  const latitudResult = readCoordinate(body.latitud, 'La latitud');
  const longitudResult = readCoordinate(body.longitud, 'La longitud');

  const fotoResult = readImage(body.foto);

  const validations = [
    tipoResult,
    mascotaIdResult,
    nombreResult,
    especieResult,
    razaResult,
    sexoResult,
    edadResult,
    descripcionResult,
    ubicacionResult,
    fotoResult
  ];

  const invalid = validations.find((item) => item.error);

  if (invalid) {
    return res.status(400).json({
      message: invalid.error
    });
  }

  if (!validateCoordinates(latitudResult, longitudResult, res)) {
    return;
  }

  const tipo = tipoResult.value;
  const mascotaId = mascotaIdResult.value;
  const nombre = nombreResult.value;
  const especie = especieResult.value;
  const raza = razaResult.value;
  const sexo = sexoResult.value;
  const edad = edadResult.value;
  const descripcion = descripcionResult.value;
  const ubicacion = ubicacionResult.value;
  const latitud = latitudResult.value;
  const longitud = longitudResult.value;
  const foto = fotoResult.value;

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
          id, usuario_id, nombre, especie, raza, sexo, edad, foto, estado
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
          id, usuario_id, nombre, especie, raza, sexo, edad, foto, estado
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

      if (!especie || !VALID_SPECIES.includes(especie)) {
        return res.status(400).json({
          message: 'Selecciona una especie válida.'
        });
      }

      if (sexo && !VALID_SEXES.includes(sexo)) {
        return res.status(400).json({
          message: 'Selecciona un sexo válido.'
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

    // Las notificaciones son secundarias: un fallo aquí no debe
    // convertir una publicación exitosa en un error para el usuario.
    try {
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
        location: ubicacion
      });
    } catch (notificationError) {
      console.warn(
        '[REPORTES] No se pudieron enviar las notificaciones generales:',
        notificationError
      );
    }

    if (
      tipo === 'ENCONTRADA' &&
      pet?.usuario_id &&
      Number(pet.usuario_id) !== Number(req.user.id)
    ) {
      try {
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
      } catch (notificationError) {
        console.warn(
          '[REPORTES] No se pudo notificar al propietario:',
          notificationError
        );
      }
    }

    return res.status(201).json({
      message: tipo === 'PERDIDA'
        ? 'Aviso de mascota perdida publicado.'
        : 'Reporte de hallazgo publicado.',
      reporte_id: result.insertId
    });
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);

    console.error(error);

    return res.status(500).json({
      message: 'No se pudo publicar el reporte.'
    });
  }
});

// ==========================================
// LISTAR AVISTAMIENTOS
// ==========================================

router.get('/reportes/:id/avistamientos', async (req, res) => {
  const reportIdResult = readId(req.params.id);

  if (reportIdResult.error) {
    return res.status(400).json({
      message: 'El identificador del reporte no es válido.'
    });
  }

  const reportId = reportIdResult.value;

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

    return res.json(rows);
  } catch (error) {
    if (missingSchema(error)) {
      return res.status(503).json({
        message: 'Falta crear la tabla de avistamientos. Revisa database/migration_sprint3_avistamientos.sql.'
      });
    }

    console.error(error);

    return res.status(500).json({
      message: 'No se pudieron cargar los avistamientos.'
    });
  }
});

// ==========================================
// REGISTRAR AVISTAMIENTO
// ==========================================

router.post('/reportes/:id/avistamientos', async (req, res) => {
  const reportIdResult = readId(req.params.id);

  if (reportIdResult.error) {
    return res.status(400).json({
      message: 'El identificador del reporte no es válido.'
    });
  }

  const reportId = reportIdResult.value;
  const body = req.body || {};

  const ubicacionResult = readLocation(body.ubicacion);
  const descripcionResult = readDescription(body.descripcion, 2000);
  const latitudResult = readCoordinate(body.latitud, 'La latitud');
  const longitudResult = readCoordinate(body.longitud, 'La longitud');
  const fotoResult = readImage(body.foto);

  const invalid = [
    ubicacionResult,
    descripcionResult,
    fotoResult
  ].find((item) => item.error);

  if (invalid) {
    return res.status(400).json({
      message: invalid.error
    });
  }

  if (!validateCoordinates(latitudResult, longitudResult, res)) {
    return;
  }

  const ubicacion = ubicacionResult.value;
  const descripcion = descripcionResult.value;
  const latitud = latitudResult.value;
  const longitud = longitudResult.value;
  const foto = fotoResult.value;

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

    // El avistamiento queda guardado aunque falle la notificación.
    try {
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
    } catch (notificationError) {
      console.warn(
        '[AVISTAMIENTOS] No se pudo notificar al propietario:',
        notificationError
      );
    }

    return res.status(201).json({
      message: 'Avistamiento enviado al propietario.',
      avistamiento_id: result.insertId
    });
  } catch (error) {
    if (missingSchema(error)) {
      return res.status(503).json({
        message: 'Falta crear la tabla de avistamientos. Revisa database/migration_sprint3_avistamientos.sql.'
      });
    }

    console.error(error);

    return res.status(500).json({
      message: 'No se pudo registrar el avistamiento.'
    });
  }
});

// ==========================================
// ACTUALIZAR ESTADO DEL REPORTE
// ==========================================

router.patch('/reportes/:id/estado', async (req, res) => {
  const reportIdResult = readId(req.params.id);
  const estadoResult = readEnum(
    req.body?.estado,
    VALID_REPORT_STATES
  );

  if (reportIdResult.error) {
    return res.status(400).json({
      message: 'El identificador del reporte no es válido.'
    });
  }

  if (estadoResult.error) {
    return res.status(400).json({
      message: 'El estado debe ser RESUELTO o CERRADO.'
    });
  }

  const reportId = reportIdResult.value;
  const estado = estadoResult.value;

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

    return res.json({
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

    return res.status(500).json({
      message: 'No se pudo actualizar el reporte.'
    });
  } finally {
    connection?.release();
  }
});

export default router;
