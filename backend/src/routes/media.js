import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { authenticate, requireActiveAccount, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveAccount, requireUser);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(currentDir, '../../uploads/images');
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

function getStorageProvider() {
  const configured = String(process.env.IMAGE_STORAGE_PROVIDER || 'local').trim().toLowerCase();
  const cloudinaryReady = Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || '').trim() &&
    String(process.env.CLOUDINARY_API_KEY || '').trim() &&
    String(process.env.CLOUDINARY_API_SECRET || '').trim()
  );
  // Keep local development behavior. On a production host, prefer durable Cloudinary
  // whenever its credentials are configured, even if the local .env says "local".
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && cloudinaryReady) return 'cloudinary';
  return configured;
}

async function storeLocalImage(buffer, extension) {
  await fs.mkdir(imageDir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(12).toString('hex')}.${extension}`;
  await fs.writeFile(path.join(imageDir, filename), buffer, { flag: 'wx' });
  return { url: `/uploads/images/${filename}`, nombre: filename, proveedor: 'local' };
}

async function storeCloudinaryImage(buffer, mimeType, extension) {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Falta configurar CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el entorno del backend.');
    error.status = 503;
    throw error;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = String(process.env.CLOUDINARY_FOLDER || 'huellitas').replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'huellitas';
  const publicId = `${Date.now()}-${randomBytes(12).toString('hex')}`;
  const canonical = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash('sha1').update(canonical).digest('hex');
  const form = new FormData();
  form.set('file', new Blob([buffer], { type: mimeType }), `${publicId}.${extension}`);
  form.set('api_key', apiKey);
  form.set('timestamp', timestamp);
  form.set('folder', folder);
  form.set('public_id', publicId);
  form.set('signature', signature);

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    const error = new Error('No se pudo conectar con el servicio externo de imágenes. Intenta de nuevo.');
    error.status = 502;
    throw error;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) {
    // No devolvemos información de credenciales ni el cuerpo del proveedor al cliente.
    const error = new Error('El servicio externo no pudo guardar la fotografía. Verifica su configuración e inténtalo de nuevo.');
    error.status = 502;
    throw error;
  }
  return { url: result.secure_url, nombre: result.public_id || publicId, proveedor: 'cloudinary', bytes: buffer.length };
}

router.post('/imagen', async (req, res) => {
  try {
    const mimeType = String(req.body?.tipo || '').toLowerCase();
    const dataUrl = String(req.body?.data || '');
    const extension = TYPES.get(mimeType);
    if (!extension) return res.status(400).json({ message: 'Formato no válido. Utiliza JPG, PNG o WEBP.' });
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1] !== mimeType) return res.status(400).json({ message: 'La imagen enviada no tiene un formato válido.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ message: 'La imagen optimizada debe pesar como máximo 3 MB.' });
    }

    // Verificar la firma del archivo, no confiar solo en el MIME informado por el navegador.
    const validSignature = mimeType === 'image/jpeg'
      ? buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8
      : mimeType === 'image/png'
        ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!validSignature) return res.status(400).json({ message: 'El contenido del archivo no coincide con su formato de imagen.' });

    const provider = getStorageProvider();
    let stored;
    if (provider === 'cloudinary') {
      stored = await storeCloudinaryImage(buffer, mimeType, extension);
    } else if (provider === 'local') {
      stored = await storeLocalImage(buffer, extension);
      stored.bytes = buffer.length;
    } else {
      return res.status(500).json({ message: 'IMAGE_STORAGE_PROVIDER debe ser local o cloudinary.' });
    }
    res.status(201).json(stored);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Error al guardar imagen:', error.message);
    res.status(500).json({ message: 'No se pudo guardar la fotografía.' });
  }
});

export default router;
