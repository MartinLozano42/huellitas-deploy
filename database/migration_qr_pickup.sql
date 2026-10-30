-- Ejecutar una sola vez en la base de datos de Huellitas existente.
-- Añade almacenamiento persistente para el retiro en sucursal.
ALTER TABLE identificaciones_qr
    ADD COLUMN pickup_sucursal VARCHAR(100) NULL AFTER archivo_qr,
    ADD COLUMN pickup_solicitado_at DATETIME NULL AFTER pickup_sucursal;
