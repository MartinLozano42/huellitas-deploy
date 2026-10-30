import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireActiveAccount, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveAccount, requireUser);

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function schemaError(res) {
  return res.status(503).json({
    message: 'Falta aplicar la migración de Sprint 3. Ejecuta database/migration_sprint3_comunicacion_reportes.sql en MySQL.'
  });
}

function missingSchema(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

async function broadcastReportNotification({ excludeUserId, excludeAlso = [], type, reportId, petName, location, latitud, longitud }) {
  const title = type === 'PERDIDA' ? 'Nueva mascota perdida' : 'Nueva mascota encontrada';
  const message = `${petName} · ${location || 'Ubicación no especificada'}. Abre Huellitas para ver el reporte #${reportId}.`;
  const excluded = [...new Set([Number(excludeUserId), ...excludeAlso.map(Number)].filter(Number.isFinite))];
  const notIn = excluded.map(() => '?').join(', ');

  // Administradores reciben los avisos para moderación. La comunidad recibe alertas
  // por proximidad cuando compartió una ubicación; si el reporte no tiene coordenadas,
  // se envía un aviso general porque no es posible calcular distancias.
  const [admins] = await pool.query(
    `SELECT id FROM usuarios WHERE rol='ADMIN' AND id NOT IN (${notIn})`, excluded
  );
  let community = [];
  if (latitud !== null && longitud !== null) {
    const [nearby] = await pool.query(
      `SELECT p.usuario_id AS id
       FROM preferencias_alertas_ubicacion p
       INNER JOIN usuarios u ON u.id=p.usuario_id
       WHERE p.activo=TRUE AND u.rol='USER' AND u.estado='APROBADO'
         AND u.id NOT IN (${notIn})
         AND (6371 * ACOS(LEAST(1, GREATEST(-1,
           SIN(RADIANS(?)) * SIN(RADIANS(p.latitud)) +
           COS(RADIANS(?)) * COS(RADIANS(p.latitud)) * COS(RADIANS(p.longitud) - RADIANS(?))
         ))))) <= p.radio_km`,
      [...excluded, latitud, latitud, longitud]
    );
    community = nearby;
  } else {
    const [allApproved] = await pool.query(
      `SELECT id FROM usuarios WHERE id NOT IN (${notIn}) AND (rol='ADMIN' OR (rol='USER' AND estado='APROBADO'))`,
      excluded
    );
    community = allApproved;
  }
  const recipients = [...new Set([...admins, ...community].map((user) => Number(user.id)))];
  if (!recipients.length) return;
  const values = recipients.map(() => '(?, ?, ?, ?)').join(', ');
  const params = recipients.flatMap((id) => [id, 'REPORTE_MASCOTA', title, message]);
  await pool.query(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje) VALUES ${values}`,
    params
  );
}

router.get('/reportes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.mascota_id, r.tipo, r.fecha_reporte, r.descripcion, r.ubicacion,
              r.latitud, r.longitud, r.foto, r.estado, r.nombre_mascota,
              r.especie_mascota, r.raza_mascota, r.sexo_mascota, r.edad_mascota,
              COALESCE(r.nombre_mascota, m.nombre) AS mascota,
              COALESCE(r.especie_mascota, m.especie) AS especie,
              COALESCE(r.raza_mascota, m.raza) AS raza,
              COALESCE(r.foto, m.foto) AS foto_mascota,
              CONCAT(u.nombre, ' ', u.apellido) AS reportante
       FROM reportes r
       LEFT JOIN mascotas m ON m.id=r.mascota_id
       INNER JOIN usuarios u ON u.id=r.usuario_id
       WHERE r.usuario_id=? ORDER BY r.fecha_reporte DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar tus reportes.' });
  }
});

router.post('/reportes', async (req, res) => {
  const tipo = String(req.body?.tipo || '').trim().toUpperCase();
  const mascotaId = req.body?.mascota_id ? Number(req.body.mascota_id) : null;
  const nombre = String(req.body?.nombre_mascota || '').trim().slice(0, 100);
  const especie = String(req.body?.especie_mascota || '').trim().toUpperCase();
  const raza = String(req.body?.raza_mascota || '').trim().slice(0, 100) || null;
  const sexo = String(req.body?.sexo_mascota || '').trim().toUpperCase() || null;
  const edad = req.body?.edad_mascota === '' || req.body?.edad_mascota == null ? null : Number(req.body.edad_mascota);
  const descripcion = String(req.body?.descripcion || '').trim().slice(0, 4000) || null;
  const ubicacion = String(req.body?.ubicacion || '').trim().slice(0, 255);
  const latitud = numberOrNull(req.body?.latitud);
  const longitud = numberOrNull(req.body?.longitud);
  const foto = String(req.body?.foto || '').trim().slice(0, 500) || null;

  if (!['PERDIDA', 'ENCONTRADA'].includes(tipo)) return res.status(400).json({ message: 'Selecciona pérdida o hallazgo.' });
  if (!ubicacion) return res.status(400).json({ message: 'Indica la última ubicación conocida o el lugar del hallazgo.' });
  if (Number.isNaN(latitud) || Number.isNaN(longitud)) return res.status(400).json({ message: 'Las coordenadas deben ser números válidos.' });
  if ((latitud === null) !== (longitud === null)) return res.status(400).json({ message: 'Completa latitud y longitud, o deja ambos campos vacíos.' });
  if (latitud !== null && (latitud < -90 || latitud > 90)) return res.status(400).json({ message: 'La latitud debe estar entre -90 y 90.' });
  if (longitud !== null && (longitud < -180 || longitud > 180)) return res.status(400).json({ message: 'La longitud debe estar entre -180 y 180.' });

  let pet = null;
  try {
    if (tipo === 'PERDIDA') {
      if (!mascotaId) return res.status(400).json({ message: 'Selecciona una de tus mascotas para reportarla como perdida.' });
      const [pets] = await pool.query(
        'SELECT id, usuario_id, nombre, especie, raza, sexo, edad, foto, estado FROM mascotas WHERE id=? AND usuario_id=? LIMIT 1',
        [mascotaId, req.user.id]
      );
      pet = pets[0];
      if (!pet) return res.status(404).json({ message: 'La mascota seleccionada no pertenece a tu cuenta.' });
      const [active] = await pool.query(
        `SELECT id FROM reportes WHERE mascota_id=? AND tipo='PERDIDA' AND estado='ACTIVO' LIMIT 1`,
        [mascotaId]
      );
      if (active[0]) return res.status(409).json({ message: 'Esta mascota ya tiene un reporte de pérdida activo.', reporte_id: active[0].id });
    } else if (mascotaId) {
      const [pets] = await pool.query(
        'SELECT id, usuario_id, nombre, especie, raza, sexo, edad, foto, estado FROM mascotas WHERE id=? LIMIT 1',
        [mascotaId]
      );
      pet = pets[0];
      if (!pet) return res.status(404).json({ message: 'No se encontró la mascota asociada al hallazgo.' });
    } else {
      if (!nombre) return res.status(400).json({ message: 'Escribe el nombre provisional o una identificación breve de la mascota encontrada.' });
      if (!['PERRO', 'GATO', 'OTRO'].includes(especie)) return res.status(400).json({ message: 'Selecciona una especie válida.' });
      if (sexo && !['MACHO', 'HEMBRA'].includes(sexo)) return res.status(400).json({ message: 'Selecciona un sexo válido.' });
      if (edad !== null && (!Number.isInteger(edad) || edad < 0 || edad > 40)) return res.status(400).json({ message: 'La edad debe ser un entero entre 0 y 40.' });
    }

    const petName = pet?.nombre || nombre;
    const petSpecies = pet?.especie || especie;
    const petBreed = pet?.raza || raza;
    const petSex = pet?.sexo || sexo;
    const petAge = pet?.edad ?? edad;
    const petPhoto = foto || pet?.foto || null;

    const [result] = await pool.query(
      `INSERT INTO reportes
       (mascota_id, usuario_id, tipo, descripcion, ubicacion, latitud, longitud, foto,
        nombre_mascota, especie_mascota, raza_mascota, sexo_mascota, edad_mascota, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')`,
      [pet?.id || null, req.user.id, tipo, descripcion, ubicacion, latitud, longitud, petPhoto,
        petName, petSpecies, petBreed, petSex, petAge]
    );

    if (tipo === 'PERDIDA' && pet?.id) {
      await pool.query("UPDATE mascotas SET estado='PERDIDA' WHERE id=? AND usuario_id=?", [pet.id, req.user.id]);
    } else if (tipo === 'ENCONTRADA' && pet?.id && pet.estado === 'PERDIDA') {
      // No cambiamos el estado de una mascota que ya figura en casa; solo una perdida
      // pasa a estar marcada como encontrada.
      await pool.query("UPDATE mascotas SET estado='ENCONTRADA' WHERE id=? AND estado='PERDIDA'", [pet.id]);
    }

    await broadcastReportNotification({
      excludeUserId: req.user.id,
      excludeAlso: tipo === 'ENCONTRADA' && pet?.usuario_id && Number(pet.usuario_id) !== Number(req.user.id) ? [pet.usuario_id] : [],
      type: tipo,
      reportId: result.insertId,
      petName,
      location: ubicacion,
      latitud,
      longitud
    });

    // Si el hallazgo está asociado a una mascota de otro usuario, se le avisa directamente.
    if (tipo === 'ENCONTRADA' && pet?.usuario_id && Number(pet.usuario_id) !== Number(req.user.id)) {
      await pool.query(
        `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje)
         VALUES (?, 'MASCOTA_ENCONTRADA', 'Posible hallazgo de tu mascota', ?)`,
        [pet.usuario_id, `Se registró un hallazgo relacionado con ${petName} en ${ubicacion}. Revisa Huellitas (reporte #${result.insertId}).`]
      );
    }

    res.status(201).json({
      message: tipo === 'PERDIDA' ? 'Aviso de mascota perdida publicado.' : 'Reporte de hallazgo publicado.',
      reporte_id: result.insertId
    });
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudo publicar el reporte.' });
  }
});

// Lista avistamientos solo para el propietario del aviso de pérdida.
router.get('/reportes/:id/avistamientos', async (req, res) => {
  try {
    const [reports] = await pool.query(
      `SELECT id FROM reportes WHERE id=? AND usuario_id=? AND tipo='PERDIDA' LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (!reports[0]) return res.status(404).json({ message: 'No se encontró un aviso de pérdida de tu cuenta.' });
    const [rows] = await pool.query(
      `SELECT a.id, a.reporte_id, a.ubicacion, a.latitud, a.longitud, a.descripcion, a.foto, a.created_at,
              CONCAT(u.nombre, ' ', LEFT(u.apellido, 1), '.') AS avistador
       FROM avistamientos a INNER JOIN usuarios u ON u.id=a.usuario_id
       WHERE a.reporte_id=? ORDER BY a.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) {
      return res.status(503).json({ message: 'Falta crear la tabla de avistamientos. Ejecuta database/migration_sprint3_avistamientos.sql.' });
    }
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los avistamientos.' });
  }
});

// Registra un avistamiento sobre un aviso de pérdida activo.
router.post('/reportes/:id/avistamientos', async (req, res) => {
  const ubicacion = String(req.body?.ubicacion || '').trim().slice(0, 255);
  const descripcion = String(req.body?.descripcion || '').trim().slice(0, 2000) || null;
  const latitud = numberOrNull(req.body?.latitud);
  const longitud = numberOrNull(req.body?.longitud);
  const foto = String(req.body?.foto || '').trim().slice(0, 500) || null;

  if (!ubicacion) return res.status(400).json({ message: 'Indica dónde viste a la mascota.' });
  if (Number.isNaN(latitud) || Number.isNaN(longitud)) return res.status(400).json({ message: 'Las coordenadas deben ser números válidos.' });
  if ((latitud === null) !== (longitud === null)) return res.status(400).json({ message: 'Completa latitud y longitud, o deja ambos campos vacíos.' });
  if (latitud !== null && (latitud < -90 || latitud > 90)) return res.status(400).json({ message: 'La latitud debe estar entre -90 y 90.' });
  if (longitud !== null && (longitud < -180 || longitud > 180)) return res.status(400).json({ message: 'La longitud debe estar entre -180 y 180.' });

  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.mascota_id, r.usuario_id, r.tipo, r.estado, COALESCE(m.nombre, 'Mascota') AS mascota
       FROM reportes r LEFT JOIN mascotas m ON m.id=r.mascota_id WHERE r.id=? LIMIT 1`,
      [req.params.id]
    );
    const report = rows[0];
    if (!report) return res.status(404).json({ message: 'No se encontró el aviso.' });
    if (report.tipo !== 'PERDIDA' || report.estado !== 'ACTIVO') {
      return res.status(409).json({ message: 'Solo puedes reportar avistamientos en avisos de pérdida activos.' });
    }
    if (Number(report.usuario_id) === Number(req.user.id)) {
      return res.status(409).json({ message: 'El propietario no necesita registrar un avistamiento en su propio aviso.' });
    }

    const [result] = await pool.query(
      `INSERT INTO avistamientos (mascota_id, reporte_id, usuario_id, ubicacion, latitud, longitud, descripcion, foto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [report.mascota_id, report.id, req.user.id, ubicacion, latitud, longitud, descripcion, foto]
    );
    await pool.query(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje)
       VALUES (?, 'AVISTAMIENTO', 'Nuevo avistamiento de tu mascota', ?)`,
      [report.usuario_id, `Alguien informó haber visto a ${report.mascota} en ${ubicacion}. Revisa el aviso y contacta a la persona en Huellitas.`]
    );
    res.status(201).json({ message: 'Avistamiento enviado al propietario.', avistamiento_id: result.insertId });
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) {
      return res.status(503).json({ message: 'Falta crear la tabla de avistamientos. Ejecuta database/migration_sprint3_avistamientos.sql.' });
    }
    console.error(error);
    res.status(500).json({ message: 'No se pudo registrar el avistamiento.' });
  }
});

router.patch('/reportes/:id/estado', async (req, res) => {
  try {
    const estado = String(req.body?.estado || '').trim().toUpperCase();
    if (!['RESUELTO', 'CERRADO'].includes(estado)) return res.status(400).json({ message: 'El estado debe ser RESUELTO o CERRADO.' });
    const [rows] = await pool.query(
      `SELECT id, mascota_id, tipo, estado FROM reportes WHERE id=? AND usuario_id=? LIMIT 1`,
      [req.params.id, req.user.id]
    );
    const report = rows[0];
    if (!report) return res.status(404).json({ message: 'Reporte no encontrado en tu cuenta.' });
    if (report.estado !== 'ACTIVO') return res.status(409).json({ message: 'El reporte ya no está activo.' });
    await pool.query('UPDATE reportes SET estado=? WHERE id=?', [estado, report.id]);
    if (report.mascota_id) {
      if (report.tipo === 'PERDIDA') {
        await pool.query("UPDATE mascotas SET estado='EN_CASA' WHERE id=? AND usuario_id=?", [report.mascota_id, req.user.id]);
      }
      await pool.query(
        `UPDATE reportes SET estado='RESUELTO'
         WHERE mascota_id=? AND estado='ACTIVO' AND tipo='PERDIDA' AND id<>? AND usuario_id=?`,
        [report.mascota_id, report.id, req.user.id]
      );
    }
    res.json({ message: estado === 'RESUELTO' ? '¡Caso resuelto! Gracias por actualizar Huellitas.' : 'Reporte cerrado.' });
  } catch (error) {
    if (missingSchema(error)) return schemaError(res);
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar el reporte.' });
  }
});

export default router;
