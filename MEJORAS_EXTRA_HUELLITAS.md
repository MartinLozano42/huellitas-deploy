# Mejoras extra de Huellitas

Esta entrega añade funciones sobre el proyecto existente; no incluye ni requiere migraciones SQL nuevas.

## Funciones añadidas

- Editar una mascota desde "Mis mascotas" o desde el detalle. El backend valida la propiedad y actualiza solo el registro cuyo `usuario_id` coincide con el usuario autenticado. Los QR existentes no se eliminan ni regeneran.
- Generador de afiches en `/usuario/afiches`, con plantillas, paletas de colores, selección de mascota, ubicación, fecha, contacto, descripción y descarga PNG.
- Accesos al editor y al generador desde la lista y detalle de mascotas.
- En producción, el endpoint de imágenes prioriza Cloudinary automáticamente cuando `NODE_ENV=production` y las tres variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` están configuradas. En desarrollo conserva el comportamiento actual según `IMAGE_STORAGE_PROVIDER`.

## Configuración y `.env`

No se incluye el archivo `.env` en este ZIP para no distribuir credenciales. Conserva tu `.env` actual sin reemplazarlo. Para usar Cloudinary en el hosting, configura las variables de Cloudinary en el panel de variables de entorno del proveedor de hosting (no las publiques en el repositorio). El backend debe ejecutarse con `NODE_ENV=production`. Si las credenciales no están configuradas, el modo local no se vuelve persistente en un hosting efímero.

La ruta de certificado CA, las credenciales de Aiven, `JWT_SECRET`, las variables de QR y las demás variables existentes no se modifican con esta entrega.

## Instalación

1. Haz una copia de seguridad de tu carpeta actual.
2. Descomprime el proyecto en una carpeta nueva.
3. Copia tu `.env` actual, sin editarlo, a `Huellitas/backend/.env`.
4. Copia también el certificado `ca.pem` que ya utilizas a `Huellitas/backend/ca.pem`, si tu configuración SSL lo requiere.
5. En `backend`, ejecuta `npm install`; luego `npm start`.
6. En `frontend`, ejecuta `npm install`; luego `npm run dev`.

No ejecutes migraciones para estas mejoras.

## Pruebas manuales recomendadas

- Editar una mascota propia y comprobar que los cambios aparecen en la ficha.
- Intentar editar una mascota de otro usuario (debe responder 404/no autorizada).
- Confirmar que el QR existente sigue apareciendo tras editar la ficha.
- Generar afiche con foto, cambiar plantilla y colores, descargar PNG y abrirlo.
- En hosting, subir una foto y verificar que la URL es HTTPS de Cloudinary; reiniciar y volver a desplegar y comprobar que la imagen sigue visible.
