import { Router } from 'express';
import pool from '../db.js';

const router = Router();

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
