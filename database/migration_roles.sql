-- Ejecutar SOLO si tu base PRMascotas ya fue creada con los roles antiguos.
USE PRMascotas;

ALTER TABLE usuarios
  MODIFY COLUMN rol ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER';

UPDATE usuarios SET rol='USER' WHERE rol IS NULL;

-- El Admin no depende del flujo de aprobación.
-- Después de ejecutar esta migración, crea/actualiza el Admin con: npm run seed:admin
