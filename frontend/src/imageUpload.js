const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo preparar la fotografía.'));
    reader.readAsDataURL(blob);
  });
}

async function bitmapFromFile(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight, image, close() {} });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('El archivo no contiene una imagen que pueda abrirse.'));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('El navegador no pudo comprimir la fotografía.')),
    type,
    quality
  ));
}

/** Validate, resize, and compress a selected image before sending it to the API. */
export async function prepareImageForUpload(file) {
  if (!file || !ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Elige una imagen JPG, PNG o WEBP.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('La imagen original debe pesar menos de 15 MB.');
  }

  const bitmap = await bitmapFromFile(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('La fotografía no tiene dimensiones válidas.');
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no pudo preparar la fotografía.');
    context.drawImage(bitmap.image || bitmap, 0, 0, canvas.width, canvas.height);

    let blob = await canvasBlob(canvas, 'image/webp', 0.82);
    if (blob.size > MAX_UPLOAD_BYTES) blob = await canvasBlob(canvas, 'image/webp', 0.68);
    if (blob.size > MAX_UPLOAD_BYTES) {
      const reduced = document.createElement('canvas');
      reduced.width = Math.max(1, Math.round(canvas.width * 0.75));
      reduced.height = Math.max(1, Math.round(canvas.height * 0.75));
      const reducedContext = reduced.getContext('2d');
      if (!reducedContext) throw new Error('El navegador no pudo redimensionar la fotografía.');
      reducedContext.drawImage(canvas, 0, 0, reduced.width, reduced.height);
      blob = await canvasBlob(reduced, 'image/webp', 0.65);
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('La fotografía sigue siendo demasiado pesada. Elige una imagen más pequeña.');
    }
    const tipo = ACCEPTED_TYPES.has(blob.type) ? blob.type : 'image/webp';
    return { tipo, data: await dataUrlFromBlob(blob), bytes: blob.size };
  } finally {
    bitmap.close?.();
  }
}
