import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import pool from '../db.js';
import {
  authenticate,
  requireActiveAccount,
  requireUser
} from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireActiveAccount, requireUser);

// ======================================================
// CONFIGURACIÓN Y VALIDACIONES
// ======================================================

const ESPECIES = ['PERRO', 'GATO', 'OTRO'];
const SEXOS = ['MACHO', 'HEMBRA'];
const VACUNACION = ['SI', 'NO'];

const SUCURSALES = [
  'Sucursal Central',
  'Sucursal Norte',
  'Sucursal Sur'
];

const PET_NAME_RE = /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u;
const BREED_RE = /^[\p{L}][\p{L}\s'().-]{0,99}$/u;
const IMAGE_LOCAL_RE = /^\/uploads\/images\/[A-Za-z0-9._-]+$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function cleanText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return '';

  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function validId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).trim() === '' || !/^\d+$/.test(String(value).trim())) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validImageReference(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  if (IMAGE_LOCAL_RE.test(value)) return true;

  try {
    const parsed = new URL(value);

    return (
      ['https:', 'http:'].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      parsed.hostname.includes('.') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function normalizePet(body = {}) {
  const rawEdad = body.edad;

  const edad = typeof rawEdad === 'number'
    ? rawEdad
    : (
        typeof rawEdad === 'string' &&
        /^\d{1,2}$/.test(rawEdad.trim())
          ? Number(rawEdad.trim())
          : NaN
      );

  const rawPrivacy = body.mostrar_contacto_qr;

  let mostrarContactoQr;

  if ([true, 1, '1'].includes(rawPrivacy)) {
    mostrarContactoQr = 1;
  } else if ([false, 0, '0', undefined, null].includes(rawPrivacy)) {
    mostrarContactoQr = 0;
  } else {
    mostrarContactoQr = NaN;
  }

  return {
    nombre: cleanText(body.nombre),
    especie: cleanText(body.especie).toUpperCase(),
    raza: cleanText(body.raza) || null,
    sexo: cleanText(body.sexo).toUpperCase() || null,
    edad,
    vacunado: cleanText(body.vacunado).toUpperCase(),
    caracteristicas: cleanText(body.caracteristicas) || null,
    foto:
      body.foto === null ||
      body.foto === undefined ||
      body.foto === ''
        ? null
        : body.foto,
    mostrar_contacto_qr: mostrarContactoQr
  };
}

function validatePet(body, pet) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Los datos de la mascota no son válidos.';
  }

  const stringFields = [
    'nombre',
    'especie',
    'raza',
    'sexo',
    'vacunado',
    'caracteristicas'
  ];

  for (const field of stringFields) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      typeof body[field] !== 'string'
    ) {
      return `El campo ${field} debe ser texto.`;
    }
  }

  if (
    body.foto !== undefined &&
    body.foto !== null &&
    typeof body.foto !== 'string'
  ) {
    return 'La fotografía debe ser una dirección de imagen válida.';
  }

  if (!pet.nombre || !pet.especie || !pet.vacunado) {
    return 'Nombre, especie y vacunación son obligatorios.';
  }

  if (body.nombre.length > 100 || !PET_NAME_RE.test(pet.nombre)) {
    return 'El nombre debe contener entre 1 y 100 letras. Se permiten espacios, guiones y apóstrofes entre palabras.';
  }

  if (!ESPECIES.includes(pet.especie)) {
    return 'Selecciona una especie válida.';
  }

  if (pet.sexo && !SEXOS.includes(pet.sexo)) {
    return 'Selecciona un sexo válido.';
  }

  if (
    !Number.isInteger(pet.edad) ||
    pet.edad < 0 ||
    pet.edad > 40
  ) {
    return 'La edad debe ser un número entero entre 0 y 40.';
  }

  if (!VACUNACION.includes(pet.vacunado)) {
    return 'Indica si la mascota está vacunada.';
  }

  if (body.raza && body.raza.length > 100) {
    return 'La raza no puede superar los 100 caracteres.';
  }

  if (pet.raza && !BREED_RE.test(pet.raza)) {
    return 'La raza debe contener letras y no puede ser solamente números o símbolos.';
  }

  if (body.caracteristicas && body.caracteristicas.length > 1000) {
    return 'Las características no pueden superar los 1000 caracteres.';
  }

  if (pet.caracteristicas) {
    if (CONTROL_CHARS_RE.test(pet.caracteristicas)) {
      return 'Las características contienen caracteres no permitidos.';
    }

    if (!/[\p{L}]/u.test(pet.caracteristicas)) {
      return 'Las características deben incluir una descripción con letras, no solamente números o símbolos.';
    }
  }

  if (pet.foto !== null && !validImageReference(pet.foto)) {
    return 'La fotografía debe ser una URL HTTP/HTTPS válida o una ruta de imagen local permitida.';
  }

  if (
    !Number.isInteger(pet.mostrar_contacto_qr) ||
    ![0, 1].includes(pet.mostrar_contacto_qr)
  ) {
    return 'La configuración de privacidad del QR no es válida.';
  }

  return null;
}

// ======================================================
// PERFIL
// ======================================================

router.get('/perfil', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        id, nombre, apellido, ci, email,
        telefono, foto, rol, estado
       FROM usuarios
       WHERE id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        message: 'Usuario no encontrado.'
      });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al cargar perfil:', error);

    res.status(500).json({
      message: 'No se pudo cargar el perfil.'
    });
  }
});

// ======================================================
// LISTAR MASCOTAS
// ======================================================

router.get('/mascotas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        id, nombre, especie, raza, sexo, edad,
        foto, vacunado, caracteristicas, estado,
        mostrar_contacto_qr, created_at
       FROM mascotas
       WHERE usuario_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al listar mascotas:', error);

    res.status(500).json({
      message: 'No se pudieron cargar tus mascotas.'
    });
  }
});

// ======================================================
// REGISTRAR MASCOTA
// ======================================================

router.post('/mascotas', async (req, res) => {
  try {
    const pet = normalizePet(req.body);
    const validationError = validatePet(req.body, pet);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    const [result] = await pool.query(
      `INSERT INTO mascotas (
        usuario_id, nombre, especie, raza, sexo,
        edad, foto, vacunado, caracteristicas,
        estado, mostrar_contacto_qr
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_CASA', ?)`,
      [
        req.user.id,
        pet.nombre,
        pet.especie,
        pet.raza,
        pet.sexo,
        pet.edad,
        pet.foto,
        pet.vacunado,
        pet.caracteristicas,
        pet.mostrar_contacto_qr
      ]
    );

    const [rows] = await pool.query(
      `SELECT *
       FROM mascotas
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [result.insertId, req.user.id]
    );

    res.status(201).json({
      message: 'Mascota registrada correctamente.',
      mascota: rows[0]
    });
  } catch (error) {
    console.error('Error al registrar mascota:', error);

    res.status(500).json({
      message: 'No se pudo registrar la mascota.'
    });
  }
});

// ======================================================
// EDITAR MASCOTA
// ======================================================

router.put('/mascotas/:id', async (req, res) => {
  try {
    const id = validId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'Identificador de mascota inválido.'
      });
    }

    const pet = normalizePet(req.body);
    const validationError = validatePet(req.body, pet);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    const [result] = await pool.query(
      `UPDATE mascotas
       SET nombre = ?, especie = ?, raza = ?, sexo = ?,
           edad = ?, foto = ?, vacunado = ?, caracteristicas = ?,
           mostrar_contacto_qr = ?
       WHERE id = ? AND usuario_id = ?`,
      [
        pet.nombre,
        pet.especie,
        pet.raza,
        pet.sexo,
        pet.edad,
        pet.foto,
        pet.vacunado,
        pet.caracteristicas,
        pet.mostrar_contacto_qr,
        id,
        req.user.id
      ]
    );

    if (!result.affectedRows) {
      const [owned] = await pool.query(
        `SELECT id
         FROM mascotas
         WHERE id = ? AND usuario_id = ?
         LIMIT 1`,
        [id, req.user.id]
      );

      if (!owned.length) {
        return res.status(404).json({
          message: 'Mascota no encontrada o no tienes permiso para editarla.'
        });
      }
    }

    const [rows] = await pool.query(
      `SELECT *
       FROM mascotas
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [id, req.user.id]
    );

    res.json({
      message: 'Mascota actualizada correctamente.',
      mascota: rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar mascota:', error);

    res.status(500).json({
      message: 'No se pudo actualizar la mascota.'
    });
  }
});

// ======================================================
// ELIMINAR MASCOTA DESDE LA CUENTA DEL PROPIETARIO
// ======================================================

router.delete('/mascotas/:id', async (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: 'Identificador de mascota inválido.'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [pets] = await connection.query(
      `SELECT id, nombre
       FROM mascotas
       WHERE id = ? AND usuario_id = ?
       FOR UPDATE`,
      [id, req.user.id]
    );

    if (!pets[0]) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Mascota no encontrada o no tienes permiso para eliminarla.'
      });
    }

    const [[qrCount]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM identificaciones_qr
       WHERE mascota_id = ?`,
      [id]
    );

    const [[reportCount]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM reportes
       WHERE mascota_id = ?`,
      [id]
    );

    const [[sightingCount]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM avistamientos
       WHERE mascota_id = ?`,
      [id]
    );

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
        message: 'No se puede eliminar esta mascota porque tiene identificaciones QR, reportes o avistamientos relacionados. Se debe conservar su historial.',
        dependencias
      });
    }

    const [result] = await connection.query(
      `DELETE FROM mascotas
       WHERE id = ? AND usuario_id = ?`,
      [id, req.user.id]
    );

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

    console.error('Error al eliminar mascota:', error);

    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'No se puede eliminar la mascota porque existen registros relacionados.'
      });
    }

    res.status(500).json({
      message: 'No se pudo eliminar la mascota.'
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ======================================================
// DETALLE DE MASCOTA
// ======================================================

router.get('/mascotas/:id', async (req, res) => {
  try {
    const id = validId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'Identificador de mascota inválido.'
      });
    }

    const [rows] = await pool.query(
      `SELECT
        id, nombre, especie, raza, sexo, edad,
        foto, vacunado, caracteristicas, estado,
        mostrar_contacto_qr, created_at
       FROM mascotas
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        message: 'Mascota no encontrada.'
      });
    }

    const [qrs] = await pool.query(
      `SELECT
        id, codigo, estado, archivo_qr,
        solicitado_at, aprobado_at
       FROM identificaciones_qr
       WHERE mascota_id = ?
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      ...rows[0],
      qrs
    });
  } catch (error) {
    console.error('Error al consultar mascota:', error);

    res.status(500).json({
      message: 'No se pudo cargar la mascota.'
    });
  }
});

// ======================================================
// LISTAR IDENTIFICACIONES QR
// ======================================================

router.get('/qr', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        q.id, q.codigo, q.estado, q.archivo_qr,
        q.solicitado_at, q.aprobado_at,
        q.pickup_sucursal, q.pickup_solicitado_at,
        m.id AS mascota_id, m.nombre AS mascota,
        m.especie, m.raza
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id = q.mascota_id
       WHERE m.usuario_id = ?
       ORDER BY q.created_at DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al listar QR:', error);

    res.status(500).json({
      message: 'No se pudieron cargar tus identificaciones QR.'
    });
  }
});

// ======================================================
// SOLICITAR RETIRO EN SUCURSAL
// ======================================================

router.patch('/qr/:id/recogida', async (req, res) => {
  try {
    const id = validId(req.params.id);
    const sucursal = cleanText(req.body?.sucursal);

    if (!id) {
      return res.status(400).json({
        message: 'Identificador QR inválido.'
      });
    }

    if (
      typeof req.body?.sucursal !== 'string' ||
      req.body.sucursal.length > 100
    ) {
      return res.status(400).json({
        message: 'La sucursal enviada no es válida.'
      });
    }

    if (!SUCURSALES.includes(sucursal)) {
      return res.status(400).json({
        message: 'Selecciona una sucursal válida.'
      });
    }

    const [rows] = await pool.query(
      `SELECT
        q.id, q.estado, q.codigo,
        m.nombre AS mascota,
        u.nombre, u.apellido
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id = q.mascota_id
       INNER JOIN usuarios u ON u.id = m.usuario_id
       WHERE q.id = ? AND u.id = ?
       LIMIT 1`,
      [id, req.user.id]
    );

    const qr = rows[0];

    if (!qr) {
      return res.status(404).json({
        message: 'Identificación QR no encontrada.'
      });
    }

    if (!['APROBADO', 'ACTIVO'].includes(qr.estado)) {
      return res.status(409).json({
        message: 'Solo puedes coordinar el retiro de un QR aprobado.'
      });
    }

    await pool.query(
      `UPDATE identificaciones_qr
       SET pickup_sucursal = ?,
           pickup_solicitado_at = NOW(),
           pickup_estado = 'PENDIENTE'
       WHERE id = ?`,
      [sucursal, qr.id]
    );

    const [admins] = await pool.query(
      `SELECT id FROM usuarios WHERE rol = 'ADMIN'`
    );

    if (admins.length) {
      const placeholders = admins.map(() => '(?, ?, ?, ?)').join(', ');

      const params = admins.flatMap((admin) => [
        admin.id,
        'QR_RECOGIDA',
        'Solicitud de retiro de QR',
        `${qr.nombre} ${qr.apellido} solicita recoger el QR ${qr.codigo} de la mascota ${qr.mascota} en ${sucursal}.`
      ]);

      await pool.query(
        `INSERT INTO notificaciones
         (usuario_id, tipo, titulo, mensaje)
         VALUES ${placeholders}`,
        params
      );
    }

    res.json({
      message: `Retiro solicitado en ${sucursal}. El Admin recibió una notificación.`,
      sucursal
    });
  } catch (error) {
    console.error('Error al solicitar retiro:', error);

    res.status(500).json({
      message: 'No se pudo guardar la sucursal de retiro.'
    });
  }
});

// ======================================================
// GENERAR IMAGEN QR
// ======================================================

router.get('/qr/:id/imagen', async (req, res) => {
  try {
    const id = validId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'Identificador QR inválido.'
      });
    }

    const [rows] = await pool.query(
      `SELECT
        q.id, q.codigo, q.estado,
        m.nombre AS mascota
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id = q.mascota_id
       WHERE q.id = ? AND m.usuario_id = ?
       LIMIT 1`,
      [id, req.user.id]
    );

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

    const base = (
      process.env.PUBLIC_QR_BASE_URL ||
      'http://localhost:5173/qr'
    ).replace(/\/$/, '');

    const payload =
      `${base}/${encodeURIComponent(qr.codigo)}`;

    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 600
    });

    res.json({
      id: qr.id,
      codigo: qr.codigo,
      mascota: qr.mascota,
      estado: qr.estado,
      payload,
      qrDataUrl
    });
  } catch (error) {
    console.error('Error al generar QR:', error);

    res.status(500).json({
      message: 'No se pudo generar el QR.'
    });
  }
});

// ======================================================
// SOLICITAR IDENTIFICACIÓN QR
// ======================================================

router.post('/mascotas/:id/qr', async (req, res) => {
  try {
    const id = validId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'Identificador de mascota inválido.'
      });
    }

    const [petRows] = await pool.query(
      `SELECT id, nombre
       FROM mascotas
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!petRows[0]) {
      return res.status(404).json({
        message: 'Mascota no encontrada.'
      });
    }

    const [existing] = await pool.query(
      `SELECT id, codigo, estado
       FROM identificaciones_qr
       WHERE mascota_id = ?
       AND estado IN ('PENDIENTE', 'APROBADO', 'ACTIVO')
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );

    if (existing[0]) {
      return res.status(409).json({
        message:
          `La mascota ya tiene una solicitud o identificación QR ` +
          `en estado ${existing[0].estado.toLowerCase()}.`,
        qr: existing[0]
      });
    }

    const codigoTemporal =
      `TEMP-${randomBytes(6).toString('hex').toUpperCase()}`;

    const [result] = await pool.query(
      `INSERT INTO identificaciones_qr
       (mascota_id, codigo, estado)
       VALUES (?, ?, 'PENDIENTE')`,
      [id, codigoTemporal]
    );

    const [rows] = await pool.query(
      `SELECT id, codigo, estado, solicitado_at
       FROM identificaciones_qr
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Solicitud de QR enviada al Admin.',
      qr: rows[0],
      mascota: petRows[0]
    });
  } catch (error) {
    console.error('Error al solicitar QR:', error);

    res.status(500).json({
      message: 'No se pudo solicitar el QR.'
    });
  }
});

export default router;
