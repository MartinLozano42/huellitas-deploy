import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import pool from '../db.js';
import { authenticate, requireActiveAccount, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveAccount, requireUser);

const PET_NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9' ._-]{1,100}$/;

function normalizePet(body = {}) {
  return {
    nombre: String(body.nombre || '').trim(),
    especie: String(body.especie || '').trim().toUpperCase(),
    raza: String(body.raza || '').trim() || null,
    sexo: String(body.sexo || '').trim().toUpperCase() || null,
    edad: body.edad === '' || body.edad == null ? null : Number(body.edad),
    vacunado: String(body.vacunado || '').trim().toUpperCase(),
    caracteristicas: String(body.caracteristicas || '').trim() || null,
    foto: String(body.foto || '').trim() || null
  };
}

router.get('/perfil', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, apellido, ci, email, telefono, foto, rol, estado
       FROM usuarios WHERE id=? LIMIT 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Usuario no encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el perfil.' });
  }
});

router.get('/mascotas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, especie, raza, sexo, edad, foto, vacunado, caracteristicas, estado, created_at
       FROM mascotas WHERE usuario_id=? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar tus mascotas.' });
  }
});

router.post('/mascotas', async (req, res) => {
  try {
    const pet = normalizePet(req.body);

    if (!pet.nombre || !pet.especie || !pet.vacunado) {
      return res.status(400).json({ message: 'Nombre, especie y vacunación son obligatorios.' });
    }

    if (!PET_NAME_RE.test(pet.nombre)) {
      return res.status(400).json({ message: 'El nombre de la mascota contiene caracteres no válidos.' });
    }

    if (!['PERRO', 'GATO', 'OTRO'].includes(pet.especie)) {
      return res.status(400).json({ message: 'Especie inválida.' });
    }

    if (pet.sexo && !['MACHO', 'HEMBRA'].includes(pet.sexo)) {
      return res.status(400).json({ message: 'Sexo inválido.' });
    }

    if (!Number.isInteger(pet.edad) || pet.edad < 0 || pet.edad > 40) {
      return res.status(400).json({ message: 'La edad debe ser un número entero entre 0 y 40.' });
    }

    if (!['SI', 'NO'].includes(pet.vacunado)) {
      return res.status(400).json({ message: 'Indica si la mascota está vacunada.' });
    }

    if (pet.foto && pet.foto.length > 500) {
      return res.status(400).json({ message: 'La referencia de la foto es demasiado larga.' });
    }

    const [result] = await pool.query(
      `INSERT INTO mascotas
       (usuario_id, nombre, especie, raza, sexo, edad, foto, vacunado, caracteristicas, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_CASA')`,
      [req.user.id, pet.nombre, pet.especie, pet.raza, pet.sexo, pet.edad, pet.foto, pet.vacunado, pet.caracteristicas]
    );

    const [rows] = await pool.query('SELECT * FROM mascotas WHERE id=? LIMIT 1', [result.insertId]);
    res.status(201).json({ message: 'Mascota registrada correctamente.', mascota: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo registrar la mascota.' });
  }
});

router.put('/mascotas/:id', async (req, res) => {
  try {
    const pet = normalizePet(req.body);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador de mascota inválido.' });
    if (!pet.nombre || !pet.especie || !pet.vacunado) return res.status(400).json({ message: 'Nombre, especie y vacunación son obligatorios.' });
    if (!PET_NAME_RE.test(pet.nombre)) return res.status(400).json({ message: 'El nombre de la mascota contiene caracteres no válidos.' });
    if (!['PERRO', 'GATO', 'OTRO'].includes(pet.especie)) return res.status(400).json({ message: 'Especie inválida.' });
    if (pet.sexo && !['MACHO', 'HEMBRA'].includes(pet.sexo)) return res.status(400).json({ message: 'Sexo inválido.' });
    if (!Number.isInteger(pet.edad) || pet.edad < 0 || pet.edad > 40) return res.status(400).json({ message: 'La edad debe ser un número entero entre 0 y 40.' });
    if (!['SI', 'NO'].includes(pet.vacunado)) return res.status(400).json({ message: 'Indica si la mascota está vacunada.' });
    if (pet.foto && pet.foto.length > 500) return res.status(400).json({ message: 'La referencia de la foto es demasiado larga.' });
    const [result] = await pool.query(
      `UPDATE mascotas SET nombre=?, especie=?, raza=?, sexo=?, edad=?, foto=?, vacunado=?, caracteristicas=?
       WHERE id=? AND usuario_id=?`,
      [pet.nombre, pet.especie, pet.raza, pet.sexo, pet.edad, pet.foto, pet.vacunado, pet.caracteristicas, id, req.user.id]
    );
    if (!result.affectedRows) {
      const [owned] = await pool.query('SELECT id FROM mascotas WHERE id=? AND usuario_id=? LIMIT 1', [id, req.user.id]);
      if (!owned.length) return res.status(404).json({ message: 'Mascota no encontrada o no tienes permiso para editarla.' });
    }
    const [rows] = await pool.query('SELECT * FROM mascotas WHERE id=? AND usuario_id=? LIMIT 1', [id, req.user.id]);
    res.json({ message: 'Mascota actualizada correctamente.', mascota: rows[0] });
  } catch (error) {
    console.error('Error al actualizar mascota:', error.message);
    res.status(500).json({ message: 'No se pudo actualizar la mascota.' });
  }
});

router.get('/mascotas/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, especie, raza, sexo, edad, foto, vacunado, caracteristicas, estado, created_at
       FROM mascotas WHERE id=? AND usuario_id=? LIMIT 1`,
      [req.params.id, req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Mascota no encontrada.' });

    const [qrs] = await pool.query(
      `SELECT id, codigo, estado, archivo_qr, solicitado_at, aprobado_at
       FROM identificaciones_qr WHERE mascota_id=? ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({ ...rows[0], qrs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar la mascota.' });
  }
});

router.get('/qr', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.id, q.codigo, q.estado, q.archivo_qr, q.solicitado_at, q.aprobado_at,
              q.pickup_sucursal, q.pickup_solicitado_at,
              m.id mascota_id, m.nombre mascota, m.especie, m.raza
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id=q.mascota_id
       WHERE m.usuario_id=?
       ORDER BY q.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar tus identificaciones QR.' });
  }
});


const SUCURSALES = ['Sucursal Central', 'Sucursal Norte', 'Sucursal Sur'];

router.patch('/qr/:id/recogida', async (req, res) => {
  try {
    const sucursal = String(req.body?.sucursal || '').trim();
    if (!SUCURSALES.includes(sucursal)) {
      return res.status(400).json({ message: 'Selecciona una sucursal válida.' });
    }

    const [rows] = await pool.query(
      `SELECT q.id, q.estado, q.pickup_sucursal, q.codigo,
              m.nombre mascota, u.id usuario_id, u.nombre, u.apellido
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id=q.mascota_id
       INNER JOIN usuarios u ON u.id=m.usuario_id
       WHERE q.id=? AND u.id=? LIMIT 1`,
      [req.params.id, req.user.id]
    );
    const qr = rows[0];
    if (!qr) return res.status(404).json({ message: 'Identificación QR no encontrada.' });
    if (!['APROBADO', 'ACTIVO'].includes(qr.estado)) {
      return res.status(409).json({ message: 'Solo puedes coordinar el retiro de un QR aprobado.' });
    }

    await pool.query(
      "UPDATE identificaciones_qr SET pickup_sucursal=?, pickup_solicitado_at=NOW(), pickup_estado='PENDIENTE' WHERE id=?",
      [sucursal, qr.id]
    );

    // Notifica a cada cuenta Admin existente. El retiro se guarda aunque aún no se haya creado un Admin.
    const [admins] = await pool.query("SELECT id FROM usuarios WHERE rol='ADMIN'");
    const titulo = 'Solicitud de retiro de QR';
    const mensaje = `${qr.nombre} ${qr.apellido} solicita recoger el QR ${qr.codigo} de la mascota ${qr.mascota} en ${sucursal}.`;
    for (const admin of admins) {
      await pool.query(
        'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje) VALUES (?, ?, ?, ?)',
        [admin.id, 'QR_RECOGIDA', titulo, mensaje]
      );
    }

    res.json({ message: `Retiro solicitado en ${sucursal}. El Admin recibió una notificación.`, sucursal, pickup_solicitado_at: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo guardar la sucursal de retiro.' });
  }
});

router.get('/qr/:id/imagen', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.id, q.codigo, q.estado, m.id mascota_id, m.nombre mascota
       FROM identificaciones_qr q
       INNER JOIN mascotas m ON m.id=q.mascota_id
       WHERE q.id=? AND m.usuario_id=? LIMIT 1`,
      [req.params.id, req.user.id]
    );

    const qr = rows[0];
    if (!qr) return res.status(404).json({ message: 'Identificación QR no encontrada.' });
    if (!['APROBADO', 'ACTIVO'].includes(qr.estado)) {
      return res.status(409).json({ message: 'El QR todavía no está aprobado.' });
    }

    const base = (process.env.PUBLIC_QR_BASE_URL || 'http://localhost:5173/qr').replace(/\/$/, '');
    const payload = `${base}/${encodeURIComponent(qr.codigo)}`;
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
    console.error(error);
    res.status(500).json({ message: 'No se pudo generar el QR.' });
  }
});

router.post('/mascotas/:id/qr', async (req, res) => {
  try {
    const [petRows] = await pool.query(
      'SELECT id, nombre FROM mascotas WHERE id=? AND usuario_id=? LIMIT 1',
      [req.params.id, req.user.id]
    );

    if (!petRows[0]) return res.status(404).json({ message: 'Mascota no encontrada.' });

    const [existing] = await pool.query(
      `SELECT id, codigo, estado FROM identificaciones_qr
       WHERE mascota_id=? AND estado IN ('PENDIENTE','APROBADO','ACTIVO')
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );

    if (existing[0]) {
      return res.status(409).json({
        message: `La mascota ya tiene una solicitud o identificación QR en estado ${existing[0].estado.toLowerCase()}.`,
        qr: existing[0]
      });
    }

    const codigoTemporal = `TEMP-${randomBytes(6).toString('hex').toUpperCase()}`;

    const [result] = await pool.query(
      `INSERT INTO identificaciones_qr (mascota_id, codigo, estado)
       VALUES (?, ?, 'PENDIENTE')`,
      [req.params.id, codigoTemporal]
    );

    const [rows] = await pool.query(
      `SELECT id, codigo, estado, solicitado_at FROM identificaciones_qr WHERE id=? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Solicitud de QR enviada al Admin.',
      qr: rows[0],
      mascota: petRows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo solicitar el QR.' });
  }
});

export default router;
