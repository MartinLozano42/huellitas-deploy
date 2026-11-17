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

// Permite letras, tildes, espacios, apóstrofes y guiones.
// No permite números ni símbolos extraños.
const PET_NAME_RE = /^[\p{L}][\p{L}\s'-]{0,99}$/u;

function cleanText(value, maxLength = 255) {
  if (value === null || value === undefined) return '';

  return String(value)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizePet(body = {}) {
  return {
    nombre: cleanText(body.nombre, 100),
    especie: cleanText(body.especie, 20).toUpperCase(),
    raza: cleanText(body.raza, 100) || null,
    sexo: cleanText(body.sexo, 20).toUpperCase() || null,
    edad: body.edad === '' || body.edad == null
      ? null
      : Number(body.edad),
    vacunado: cleanText(body.vacunado, 10).toUpperCase(),
    caracteristicas: cleanText(body.caracteristicas, 1000) || null,
    foto: cleanText(body.foto, 500) || null
  };
}

function validatePet(pet) {
  if (!pet.nombre || !pet.especie || !pet.vacunado) {
    return 'Nombre, especie y vacunación son obligatorios.';
  }

  if (!PET_NAME_RE.test(pet.nombre)) {
    return 'El nombre debe contener únicamente letras, espacios, guiones o apóstrofes.';
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

  if (pet.raza && pet.raza.length > 100) {
    return 'La raza no puede superar los 100 caracteres.';
  }

  if (
    pet.caracteristicas &&
    pet.caracteristicas.length > 1000
  ) {
    return 'Las características no pueden superar los 1000 caracteres.';
  }

  if (pet.foto && pet.foto.length > 500) {
    return 'La referencia de la fotografía es demasiado larga.';
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
        id,
        nombre,
        apellido,
        ci,
        email,
        telefono,
        foto,
        rol,
        estado
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
        id,
        nombre,
        especie,
        raza,
        sexo,
        edad,
        foto,
        vacunado,
        caracteristicas,
        estado,
        created_at
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
    const validationError = validatePet(pet);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    const [result] = await pool.query(
      `INSERT INTO mascotas (
        usuario_id,
        nombre,
        especie,
        raza,
        sexo,
        edad,
        foto,
        vacunado,
        caracteristicas,
        estado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_CASA')`,
      [
        req.user.id,
        pet.nombre,
        pet.especie,
        pet.raza,
        pet.sexo,
        pet.edad,
        pet.foto,
        pet.vacunado,
        pet.caracteristicas
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
    const validationError = validatePet(pet);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    const [result] = await pool.query(
      `UPDATE mascotas
       SET
        nombre = ?,
        especie = ?,
        raza = ?,
        sexo = ?,
        edad = ?,
        foto = ?,
        vacunado = ?,
        caracteristicas = ?
       WHERE id = ?
       AND usuario_id = ?`,
      [
        pet.nombre,
        pet.especie,
        pet.raza,
        pet.sexo,
        pet.edad,
        pet.foto,
        pet.vacunado,
        pet.caracteristicas,
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
        id,
        nombre,
        especie,
        raza,
        sexo,
        edad,
        foto,
        vacunado,
        caracteristicas,
        estado,
        created_at
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
        id,
        codigo,
        estado,
        archivo_qr,
        solicitado_at,
        aprobado_at
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
        q.id,
        q.codigo,
        q.estado,
        q.archivo_qr,
        q.solicitado_at,
        q.aprobado_at,
        q.pickup_sucursal,
        q.pickup_solicitado_at,
        m.id AS mascota_id,
        m.nombre AS mascota,
        m.especie,
        m.raza
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
    const sucursal = cleanText(req.body?.sucursal, 100);

    if (!id) {
      return res.status(400).json({
        message: 'Identificador QR inválido.'
      });
    }

    if (!SUCURSALES.includes(sucursal)) {
      return res.status(400).json({
        message: 'Selecciona una sucursal válida.'
      });
    }

    const [rows] = await pool.query(
      `SELECT
        q.id,
        q.estado,
        q.codigo,
        m.nombre AS mascota,
        u.nombre,
        u.apellido
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
       SET
        pickup_sucursal = ?,
        pickup_solicitado_at = NOW(),
        pickup_estado = 'PENDIENTE'
       WHERE id = ?`,
      [sucursal, qr.id]
    );

    const [admins] = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE rol = 'ADMIN'`
    );

    const titulo = 'Solicitud de retiro de QR';

    const mensaje =
      `${qr.nombre} ${qr.apellido} solicita recoger el QR ` +
      `${qr.codigo} de la mascota ${qr.mascota} en ${sucursal}.`;

    if (admins.length) {
      const placeholders = admins.map(() => '(?, ?, ?, ?)').join(', ');

      const params = admins.flatMap((admin) => [
        admin.id,
        'QR_RECOGIDA',
        titulo,
        mensaje
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
        q.id,
        q.codigo,
        q.estado,
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
