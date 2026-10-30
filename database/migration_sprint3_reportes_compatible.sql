-- Huellitas: compatibilidad de reportes con el esquema actual de PRMascotas.
-- Respalda la base antes de ejecutar. No elimina registros ni recrea tablas.
-- Permite reportar animales encontrados no registrados y guardar una ficha básica del aviso.
USE PRMascotas;

ALTER TABLE reportes
  MODIFY COLUMN mascota_id BIGINT UNSIGNED NULL,
  ADD COLUMN nombre_mascota VARCHAR(100) NULL AFTER foto,
  ADD COLUMN especie_mascota VARCHAR(30) NULL AFTER nombre_mascota,
  ADD COLUMN raza_mascota VARCHAR(100) NULL AFTER especie_mascota,
  ADD COLUMN sexo_mascota VARCHAR(20) NULL AFTER raza_mascota,
  ADD COLUMN edad_mascota INT UNSIGNED NULL AFTER sexo_mascota;
