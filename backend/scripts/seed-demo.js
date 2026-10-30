import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pool from '../src/db.js';

dotenv.config();

const users = [
  ['María', 'Benítez', '90000001', 'maria.demo@prmascotas.com', '70000001'],
  ['Juan', 'Pérez', '90000002', 'juan.demo@prmascotas.com', '70000002'],
  ['Gabriela', 'Suárez', '90000003', 'gabriela.demo@prmascotas.com', '70000003'],
  ['Carlos', 'Rojas', '90000004', 'carlos.demo@prmascotas.com', '70000004'],
  ['Lucía', 'Vargas', '90000005', 'lucia.demo@prmascotas.com', '70000005']
];

try {
  const passwordHash = await bcrypt.hash('Demo1234!', 10);
const [adminRows] = await pool.query("SELECT id FROM usuarios WHERE rol='ADMIN' ORDER BY id LIMIT 1");
  if (!adminRows[0]) throw new Error('Primero ejecutá npm run seed:admin para crear el Admin.');
  const adminId = adminRows[0].id;

  const userIds = [];
  for (let i = 0; i < users.length; i++) {
    const [existing] = await pool.query('SELECT id FROM usuarios WHERE email=? LIMIT 1', [users[i][3]]);
    let id;
    if (existing[0]) {
      id = existing[0].id;
      await pool.query("UPDATE usuarios SET password_hash=?, estado=?, email_verificado=TRUE, aprobado_por=?, fecha_aprobacion=NOW() WHERE id=?", [passwordHash, i === 4 ? 'PENDIENTE' : 'APROBADO', i === 4 ? null : adminId, id]);
    } else {
      const [r] = await pool.query("INSERT INTO usuarios (nombre,apellido,ci,email,telefono,password_hash,rol,estado,email_verificado,fecha_aprobacion,aprobado_por) VALUES (?,?,?,?,?,?, 'USER', ?, TRUE, CASE WHEN ?='APROBADO' THEN NOW() ELSE NULL END, ?)", [users[i][0], users[i][1], users[i][2], users[i][3], users[i][4], passwordHash, i === 4 ? 'PENDIENTE' : 'APROBADO', i === 4 ? 'PENDIENTE' : 'APROBADO', i === 4 ? null : adminId]);
      id = r.insertId;
    }
    userIds.push(id);
  }

  const pets = [
    [userIds[0], 'Luna', 'PERRO', 'Golden Retriever', 'HEMBRA', 2, 'Mancha blanca en el pecho; pelaje claro.', 'EN_CASA', 'SI'],
    [userIds[0], 'Simba', 'GATO', 'Siamés', 'MACHO', 3, 'Ojos azules y cola oscura.', 'PERDIDA', 'SI'],
    [userIds[1], 'Rocky', 'PERRO', 'Mestizo', 'MACHO', 4, 'Collar azul.', 'ENCONTRADA', 'NO'],
    [userIds[1], 'Mimi', 'GATO', 'Siamés', 'HEMBRA', 1, 'Pequeña, ojos azules.', 'EN_CASA', 'SI'],
    [userIds[2], 'Bobby', 'PERRO', 'Bulldog', 'MACHO', 5, 'Mancha oscura en la oreja izquierda.', 'PERDIDA', 'NO'],
    [userIds[3], 'Rocco', 'PERRO', 'Bulldog Francés', 'MACHO', 3, 'Hocico oscuro y arnés rojo.', 'PERDIDA', 'SI'],
    [userIds[3], 'Mora', 'GATO', 'Común europeo', 'HEMBRA', 2, 'Tricolor.', 'EN_CASA', 'SI'],
    [userIds[4], 'Toby', 'PERRO', 'Beagle', 'MACHO', 6, 'Orejas largas.', 'EN_CASA', 'NO']
  ];

  const petIds = [];
  for (const pet of pets) {
    const [existing] = await pool.query('SELECT id FROM mascotas WHERE usuario_id=? AND nombre=? LIMIT 1', [pet[0], pet[1]]);
    if (existing[0]) { petIds.push(existing[0].id); continue; }
    const [r] = await pool.query('INSERT INTO mascotas (usuario_id,nombre,especie,raza,sexo,edad,caracteristicas,estado,vacunado) VALUES (?,?,?,?,?,?,?,?,?)', pet);
    petIds.push(r.insertId);
  }

  const [qrCheck] = await pool.query('SELECT id FROM identificaciones_qr LIMIT 1');
  if (!qrCheck[0]) {
    await pool.query("INSERT INTO identificaciones_qr (mascota_id,codigo,estado) VALUES (?,?,'PENDIENTE'), (?,?,'ACTIVO'), (?,?,'APROBADO')", [petIds[0], 'TEMP-LUNA-001', petIds[1], 'PRM-SIMBA-001', petIds[2], 'PRM-ROCKY-001']);
  }

  const [reportCheck] = await pool.query('SELECT id FROM reportes LIMIT 1');
  if (!reportCheck[0]) {
    await pool.query("INSERT INTO reportes (mascota_id,usuario_id,tipo,descripcion,ubicacion,latitud,longitud,estado,fecha_reporte) VALUES (?,?,?,?,?,?,?,?, NOW()-INTERVAL 3 DAY)", [petIds[1], userIds[0], 'PERDIDA', 'Se perdió durante un paseo.', 'Plaza Italia', -17.395, -66.157, 'ACTIVO']);
    await pool.query("INSERT INTO reportes (mascota_id,usuario_id,tipo,descripcion,ubicacion,latitud,longitud,estado,fecha_reporte) VALUES (?,?,?,?,?,?,?,?, NOW()-INTERVAL 2 DAY)", [petIds[2], userIds[1], 'ENCONTRADA', 'Fue encontrada cerca de una plaza.', 'Av. Central', -17.391, -66.154, 'RESUELTO']);
    await pool.query("INSERT INTO reportes (mascota_id,usuario_id,tipo,descripcion,ubicacion,latitud,longitud,estado,fecha_reporte) VALUES (?,?,?,?,?,?,?,?, NOW()-INTERVAL 1 DAY)", [petIds[4], userIds[2], 'PERDIDA', 'No regresó al hogar.', 'Barrio Norte', -17.389, -66.159, 'ACTIVO']);
    await pool.query("INSERT INTO reportes (mascota_id,usuario_id,tipo,descripcion,ubicacion,latitud,longitud,estado,fecha_reporte) VALUES (?,?,?,?,?,?,?,?, NOW()-INTERVAL 12 HOUR)", [petIds[5], userIds[3], 'PERDIDA', 'Se perdió al salir del jardín.', 'Centro', -17.393, -66.160, 'ACTIVO']);
  }

  console.log('Datos demo creados/actualizados. Password de usuarios demo: Demo1234!');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
