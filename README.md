# Huellitas — Web + API

Proyecto de Huellitas con área Admin, autenticación y área de usuario para registrar mascotas y solicitar identificaciones QR.

## Puertos

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`

## Ejecutar backend

```bash
cd backend
npm install
npm run dev
```

## Ejecutar frontend

```bash
cd frontend
npm install
npm run dev
```

## Flujo de usuario

1. Crear cuenta.
2. Esperar aprobación del Admin.
3. Iniciar sesión.
4. Registrar una mascota.
5. Solicitar una identificación QR.
6. El Admin revisa y aprueba la solicitud.

El archivo `backend/.env` contiene la configuración local y no debe modificarse durante estas mejoras.


## Cambios de esta versión (QR y retiro en sucursal)

- El área de usuario incorpora el lector QR con cámara o selección de imagen. En `frontend`, ejecuta `npm install` para instalar `html5-qrcode` y actualizar `package-lock.json`. Para acceso a cámara, usa `http://localhost:5173` en la misma computadora o HTTPS y concede permisos al navegador.
- La selección de sucursal se guarda en la base de datos y genera una notificación para las cuentas con rol `ADMIN`.
- El panel Admin muestra la sucursal elegida, la fecha de solicitud y permite descargar el QR en PNG. La campana muestra notificaciones y permite marcarlas como leídas.
- En una base de datos Huellitas ya existente, ejecuta una sola vez `database/migration_qr_pickup.sql`. En una instalación nueva, las columnas ya están incluidas en `database/PRMascotas.sql`.
- No se requiere cambiar el archivo `.env`.


## Indicadores de solicitudes del panel Admin

El menú muestra contadores rojos para usuarios pendientes de aprobación y solicitudes QR/retiros pendientes. La sección Identificaciones QR separa las colas Todos, Por aprobar y Retiros en sucursal. Una solicitud de retiro puede marcarse como atendida para quitarla del contador sin borrar su historial.

Para habilitar el estado del retiro en una base existente, ejecuta una sola vez `database/migration_qr_pickup_estado.sql` después de haber agregado las columnas de sucursal mediante `database/migration_qr_pickup.sql`. No es necesario modificar `.env` ni recrear las tablas.

## Sprint 3 — reportes, chat seguro, imágenes y notificaciones

Se añadieron estas funciones al área de usuario:

- Publicar avisos de mascotas perdidas y encontradas.
- Adjuntar una fotografía JPG, PNG o WEBP (máximo 3 MB) a un aviso.
- Registrar la ubicación como texto y, opcionalmente, coordenadas manuales o del navegador.
- Consultar avisos de la comunidad, buscar y filtrar por tipo y estado, y consultar los propios reportes.
- Informar un avistamiento en un reporte de pérdida activo; el propietario recibe una notificación.
- Ficha pública para QR desde `/qr/:codigo`, con acciones para contactar al propietario o reportar un hallazgo; el lector QR existente se conserva.
- Iniciar una conversación segura con el propietario desde el resultado del lector QR o contactar al reportante de un caso.
- Consultar el historial de conversaciones, enviar mensajes y marcar mensajes recibidos como leídos.
- Consultar y marcar notificaciones personales, incluidos nuevos reportes y mensajes.
- Marcar los reportes propios como resueltos o cerrados.

### Migración requerida

Antes de utilizar estas funciones en una base existente, ejecutar **una sola vez** el archivo:

`database/migration_sprint3_comunicacion_reportes.sql`

La migración permite avisos de hallazgo para mascotas que todavía no están registradas y crea las tablas `conversaciones` y `mensajes`. No elimina datos actuales. Luego ejecuta una vez `database/migration_sprint3_avistamientos.sql` para habilitar el registro de avistamientos. Si la migración principal de Sprint 3 ya se ejecutó anteriormente, no vuelvas a ejecutarla: aplica solo la nueva migración de avistamientos. Si se instala una base de cero, ejecutar primero `database/PRMascotas.sql` y las migraciones de QR que correspondan; luego las dos migraciones de Sprint 3.

### Almacenamiento de imágenes

Las fotografías de mascota y de reportes se redimensionan y comprimen en el navegador antes de subirlas. En modo local (`IMAGE_STORAGE_PROVIDER=local`), los archivos se guardan en `backend/uploads/images` y MySQL guarda la ruta relativa. Para evitar consumir el disco del backend en el despliegue, está disponible un adaptador opcional de Cloudinary: define `IMAGE_STORAGE_PROVIDER=cloudinary` y configura `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`. Las variables opcionales se documentan en `backend/.env.example`; el archivo `.env` existente no fue modificado. No uses el modo local en producción salvo que el servidor tenga un volumen persistente.

### Limitaciones conocidas de esta primera integración

- Los avisos se publican en la comunidad y generan notificaciones para el Admin. Cuando hay coordenadas, también se avisa a los usuarios aprobados que activaron alertas cercanas dentro de su radio configurado; sin coordenadas se envía un aviso general a usuarios aprobados.
- Los reportes con coordenadas incluyen un mapa embebido por aviso y un enlace para abrirlo completo. No hay todavía un único mapa comunitario con múltiples marcadores sincronizados en vivo.
- Los QR nuevos deben apuntar a la ficha pública del frontend. En desarrollo, la base por defecto del código es `http://localhost:5173/qr`. Para despliegue, configura las variables de entorno de ejecución `PUBLIC_QR_BASE_URL` con la URL completa del frontend que contiene `/qr`, y `PUBLIC_FRONTEND_URL` con el origen público del frontend. No es necesario editar el archivo `.env` local para configurar esas variables en el proveedor de despliegue. Los QR viejos que apunten al backend se redirigen a `PUBLIC_FRONTEND_URL`; si esa variable no está configurada, el fallback es `http://localhost:5173`.
- El chat actualiza la conversación mediante sondeo periódico; no utiliza WebSocket ni notificaciones push del sistema operativo.
- Los mensajes de chat son texto; no se adjuntan imágenes ni documentos desde el chat.

El archivo `backend/.env` se conserva sin cambios.


### Lista de pruebas manuales del Sprint 3

1. Con dos usuarios aprobados, escanear un QR activo y abrir el chat con el propietario.
2. Enviar mensajes desde ambas cuentas, comprobar que se guardan al recargar y que las notificaciones aparecen para el destinatario.
3. Crear un reporte de pérdida desde una mascota propia y comprobar que no se permite publicar un segundo reporte de pérdida activo para la misma mascota.
4. Crear un reporte de hallazgo con una mascota vinculada o sin datos registrados, incluyendo foto y ubicación cuando estén disponibles.
5. Abrir un reporte de la comunidad, registrar un avistamiento y comprobar que el propietario recibe el aviso, ve el historial y puede contactar a quien lo informó.
6. Activar alertas cercanas con ubicación y radio, y crear un reporte con coordenadas dentro y fuera del radio en cuentas de prueba separadas.
7. Marcar un reporte propio como resuelto y comprobar que deja de aparecer en la lista de activos.
8. Probar la carga de imagen con el almacenamiento configurado para el entorno. En producción, usar almacenamiento externo y confirmar que la URL sigue funcionando después de reiniciar o desplegar el backend.
9. Probar la ficha de QR desde un teléfono: los enlaces deben abrir el frontend publicado, no `localhost`.
10. Confirmar que un usuario no puede leer conversaciones ajenas ni consultar los avistamientos privados de otro propietario.

## Preparación para despliegue y seguridad

- El backend carga `backend/.env` usando una ruta absoluta basada en el archivo, por lo que puede iniciarse desde otra carpeta. En el hosting, configura las mismas variables como secretos del servicio.
- `CORS_ORIGINS` admite uno o varios orígenes separados por comas. Si no se define, se utiliza `PUBLIC_FRONTEND_URL` y, en desarrollo, `http://localhost:5173`.
- `DB_SSL_CA` puede ser una ruta absoluta o una ruta relativa a la carpeta `backend`.
- La autenticación vuelve a comprobar el estado y el rol de la cuenta en MySQL en cada petición protegida.
- El frontend incluye un manifiesto y un service worker básico para instalación PWA. Las respuestas `/api/` nunca se almacenan en caché.
- No subas `backend/.env`, certificados privados, `node_modules`, `uploads` ni archivos de producción a GitHub. El `.env` local se conserva en tu copia de trabajo, pero debe permanecer ignorado por Git.

### Migración de comunicación

La migración `database/migration_sprint3_comunicacion_reportes.sql` define el esquema esperado por `backend/src/routes/communication.js` (`usuario_iniciador_id`, `usuario_receptor_id`, `contenido`, `ultimo_mensaje_at` y `preferencias_notificacion`). Está pensada para una instalación nueva. **No la ejecutes sobre la base Aiven actual sin comparar antes `SHOW CREATE TABLE` de `conversaciones`, `mensajes` y `preferencias_notificacion`**. Para bases existentes, prepara una migración incremental específica y haz respaldo antes de aplicarla.
