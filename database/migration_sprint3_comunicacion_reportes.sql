-- Huellitas / Sprint 3: reportes, conversaciones, mensajes y preferencias.
-- Para una instalación NUEVA. No ejecutar sobre una base que ya tenga estas
-- columnas/tablas sin comparar primero el esquema actual.

ALTER TABLE reportes
  MODIFY COLUMN mascota_id BIGINT UNSIGNED NULL,
  ADD COLUMN nombre_mascota VARCHAR(100) NULL AFTER foto,
  ADD COLUMN especie_mascota VARCHAR(30) NULL AFTER nombre_mascota,
  ADD COLUMN raza_mascota VARCHAR(100) NULL AFTER especie_mascota,
  ADD COLUMN sexo_mascota VARCHAR(20) NULL AFTER raza_mascota,
  ADD COLUMN edad_mascota INT UNSIGNED NULL AFTER sexo_mascota;

CREATE TABLE IF NOT EXISTS conversaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mascota_id BIGINT UNSIGNED NULL,
  reporte_id BIGINT UNSIGNED NULL,
  usuario_iniciador_id BIGINT UNSIGNED NOT NULL,
  usuario_receptor_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('ACTIVA','CERRADA') NOT NULL DEFAULT 'ACTIVA',
  ultimo_mensaje_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conversacion_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_conversacion_reporte FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_conversacion_iniciador FOREIGN KEY (usuario_iniciador_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_conversacion_receptor FOREIGN KEY (usuario_receptor_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_conversacion_iniciador (usuario_iniciador_id, updated_at),
  INDEX idx_conversacion_receptor (usuario_receptor_id, updated_at),
  INDEX idx_conversacion_mascota (mascota_id),
  INDEX idx_conversacion_reporte (reporte_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversacion_id BIGINT UNSIGNED NOT NULL,
  remitente_id BIGINT UNSIGNED NOT NULL,
  contenido TEXT NOT NULL,
  leido_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mensaje_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_mensaje_remitente FOREIGN KEY (remitente_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_mensaje_conversacion_fecha (conversacion_id, created_at),
  INDEX idx_mensaje_no_leido (conversacion_id, leido_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS preferencias_notificacion (
  usuario_id BIGINT UNSIGNED PRIMARY KEY,
  radio_alerta_km SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  avistamientos_cercanos BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_preferencias_notificacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_preferencias_notificacion_activo (avistamientos_cercanos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_reportes_tipo_estado_fecha ON reportes (tipo, estado, fecha_reporte);
