-- Huellitas · Sprint 3: historial de avistamientos
-- Ejecutar una vez después de database/migration_sprint3_comunicacion_reportes.sql.
-- Es aditiva: no elimina ni modifica los reportes existentes.

CREATE TABLE IF NOT EXISTS avistamientos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporte_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  ubicacion VARCHAR(255) NOT NULL,
  latitud DECIMAL(10,7) NULL,
  longitud DECIMAL(10,7) NULL,
  descripcion VARCHAR(2000) NULL,
  foto VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_avistamiento_reporte FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_avistamiento_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_avistamiento_coordenadas CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)),
  INDEX idx_avistamiento_reporte_fecha (reporte_id, created_at),
  INDEX idx_avistamiento_usuario_fecha (usuario_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
