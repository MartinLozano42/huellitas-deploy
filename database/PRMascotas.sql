-- PRMASCOTAS - Base de datos inicial
-- MySQL 8.x / Aiven
-- Esquema basado en el Figma y reglas funcionales definidas

CREATE DATABASE IF NOT EXISTS PRMascotas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE PRMascotas;

-- =========================
-- USUARIOS
-- =========================
CREATE TABLE usuarios (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    ci VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    telefono VARCHAR(30) NULL,
    password_hash VARCHAR(255) NOT NULL,
    foto VARCHAR(500) NULL,

    rol ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    estado ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO')
        NOT NULL DEFAULT 'PENDIENTE',
    email_verificado BOOLEAN NOT NULL DEFAULT FALSE,

    fecha_aprobacion DATETIME NULL,
    aprobado_por BIGINT UNSIGNED NULL,
    ultimo_acceso DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario_aprobador
        FOREIGN KEY (aprobado_por) REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    INDEX idx_usuarios_estado (estado),
    INDEX idx_usuarios_rol (rol),
    INDEX idx_usuarios_aprobado_por (aprobado_por)
) ENGINE=InnoDB;

-- =========================
-- MASCOTAS
-- =========================
CREATE TABLE mascotas (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT UNSIGNED NOT NULL,

    nombre VARCHAR(100) NOT NULL,
    especie ENUM('PERRO', 'GATO', 'OTRO') NOT NULL DEFAULT 'PERRO',
    raza VARCHAR(100) NULL,
    sexo ENUM('MACHO', 'HEMBRA') NULL,
    edad INT UNSIGNED NULL,

    foto VARCHAR(500) NULL,
    vacunado ENUM('SI', 'NO') NOT NULL,
    caracteristicas TEXT NULL,

    estado ENUM('EN_CASA', 'PERDIDA', 'ENCONTRADA')
        NOT NULL DEFAULT 'EN_CASA',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_mascota_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    INDEX idx_mascotas_usuario (usuario_id),
    INDEX idx_mascotas_estado (estado),
    INDEX idx_mascotas_especie (especie)
) ENGINE=InnoDB;

-- =========================
-- IDENTIFICACIONES QR
-- =========================
CREATE TABLE identificaciones_qr (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mascota_id BIGINT UNSIGNED NOT NULL,

    codigo VARCHAR(100) NOT NULL UNIQUE,

    estado ENUM(
        'PENDIENTE',
        'APROBADO',
        'RECHAZADO',
        'ACTIVO',
        'DESACTIVADO'
    ) NOT NULL DEFAULT 'PENDIENTE',

    archivo_qr VARCHAR(500) NULL,
    pickup_sucursal VARCHAR(100) NULL,
    pickup_solicitado_at DATETIME NULL,

    solicitado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aprobado_at DATETIME NULL,
    aprobado_por BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_qr_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_qr_aprobador
        FOREIGN KEY (aprobado_por) REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    INDEX idx_qr_mascota (mascota_id),
    INDEX idx_qr_estado (estado),
    INDEX idx_qr_aprobado_por (aprobado_por)
) ENGINE=InnoDB;

-- =========================
-- REPORTES DE PÉRDIDA / HALLAZGO
-- =========================
CREATE TABLE reportes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    mascota_id BIGINT UNSIGNED NOT NULL,
    usuario_id BIGINT UNSIGNED NOT NULL,

    tipo ENUM('PERDIDA', 'ENCONTRADA') NOT NULL,

    fecha_reporte DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    descripcion TEXT NULL,

    ubicacion VARCHAR(255) NULL,
    latitud DECIMAL(10, 7) NULL,
    longitud DECIMAL(10, 7) NULL,

    foto VARCHAR(500) NULL,

    estado ENUM('ACTIVO', 'RESUELTO', 'CERRADO')
        NOT NULL DEFAULT 'ACTIVO',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_reporte_mascota
        FOREIGN KEY (mascota_id) REFERENCES mascotas(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_reporte_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    INDEX idx_reportes_mascota (mascota_id),
    INDEX idx_reportes_usuario (usuario_id),
    INDEX idx_reportes_tipo (tipo),
    INDEX idx_reportes_estado (estado),
    INDEX idx_reportes_fecha (fecha_reporte)
) ENGINE=InnoDB;

-- =========================
-- NOTIFICACIONES
-- =========================
CREATE TABLE notificaciones (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    usuario_id BIGINT UNSIGNED NOT NULL,

    tipo VARCHAR(50) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,

    leida BOOLEAN NOT NULL DEFAULT FALSE,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notificacion_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    INDEX idx_notificaciones_usuario (usuario_id),
    INDEX idx_notificaciones_leida (leida),
    INDEX idx_notificaciones_fecha (fecha)
) ENGINE=InnoDB;

-- =========================
-- VISTAS ÚTILES PARA EL PANEL
-- =========================

-- Mascotas con información del propietario
CREATE OR REPLACE VIEW vista_mascotas_admin AS
SELECT
    m.id AS mascota_id,
    m.nombre AS mascota,
    m.especie,
    m.raza,
    m.sexo,
    m.edad,
    m.vacunado,
    m.estado AS estado_mascota,
    u.id AS usuario_id,
    CONCAT(u.nombre, ' ', u.apellido) AS propietario,
    u.ci,
    u.email,
    u.telefono,
    m.created_at
FROM mascotas m
INNER JOIN usuarios u ON u.id = m.usuario_id;

-- Solicitudes de QR pendientes
CREATE OR REPLACE VIEW vista_qr_pendientes AS
SELECT
    q.id AS qr_id,
    q.codigo,
    q.estado,
    q.solicitado_at,
    m.id AS mascota_id,
    m.nombre AS mascota,
    m.especie,
    CONCAT(u.nombre, ' ', u.apellido) AS propietario,
    u.ci,
    u.email
FROM identificaciones_qr q
INNER JOIN mascotas m ON m.id = q.mascota_id
INNER JOIN usuarios u ON u.id = m.usuario_id
WHERE q.estado = 'PENDIENTE';
