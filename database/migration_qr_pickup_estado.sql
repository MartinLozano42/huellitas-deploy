-- Ejecutar una sola vez después de migration_qr_pickup.sql.
-- Permite distinguir retiros nuevos de solicitudes ya atendidas.
ALTER TABLE identificaciones_qr
    ADD COLUMN pickup_estado ENUM('PENDIENTE','ATENDIDO') NULL DEFAULT NULL AFTER pickup_solicitado_at;

UPDATE identificaciones_qr
SET pickup_estado='PENDIENTE'
WHERE pickup_sucursal IS NOT NULL AND pickup_estado IS NULL;
