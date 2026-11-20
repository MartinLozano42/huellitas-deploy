import { useEffect, useState } from 'react';
import { Camera, PawPrint, Save, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

const VALID_SPECIES = ['PERRO', 'GATO', 'OTRO'];
const VALID_SEXES = ['MACHO', 'HEMBRA'];
const VALID_VACCINATION = ['SI', 'NO'];

const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LETTER_RE = /\p{L}/u;
const CHARACTERISTICS_RE = /^[\p{L} \r\n]+$/u;
const NAME_RE = /^[\p{L}][\p{L}\s'-]{0,99}$/u;
const BREED_RE = /^[\p{L}][\p{L}\s'().-]{0,99}$/u;
const IMAGE_LOCAL_RE = /^\/uploads\/images\/[A-Za-z0-9._-]+$/;

const INITIAL_FORM = {
  nombre: '',
  especie: 'PERRO',
  raza: '',
  sexo: 'MACHO',
  edad: '0',
  vacunado: 'SI',
  caracteristicas: '',
  foto: '',
  mostrar_contacto_qr: false
};

function normalizeText(value) {
  if (typeof value !== 'string') return null;

  return value
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n');
}

function validateText(value, options = {}) {
  const {
    required = false,
    maxLength = 1000,
    minLength = 1,
    requireLetters = false,
    allowNewLines = false
  } = options;

  if (typeof value !== 'string') {
    return { error: 'El formato del campo no es válido.' };
  }

  let normalized = normalizeText(value);

  if (normalized === null) {
    return { error: 'El formato del campo no es válido.' };
  }

  if (CONTROL_CHAR_RE.test(normalized)) {
    return { error: 'El campo contiene caracteres no permitidos.' };
  }

  if (!allowNewLines) {
    normalized = normalized.replace(/\s+/g, ' ');
  } else {
    normalized = normalized
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n');
  }

  normalized = normalized.trim();

  if (!normalized) {
    return required
      ? { error: 'Este campo es obligatorio.' }
      : { value: '' };
  }

  if (normalized.length < minLength) {
    return {
      error: `El campo debe tener al menos ${minLength} caracteres.`
    };
  }

  if (normalized.length > maxLength) {
    return {
      error: `El campo no puede superar los ${maxLength} caracteres.`
    };
  }

  if (requireLetters && !LETTER_RE.test(normalized)) {
    return {
      error: 'El campo debe contener letras.'
    };
  }

  return { value: normalized };
}

function validateImageUrl(value) {
  const image = value.trim();

  if (!image) return { value: '' };

  if (image.length > 500) {
    return {
      error: 'La dirección de la fotografía es demasiado larga.'
    };
  }

  if (IMAGE_LOCAL_RE.test(image)) {
    return { value: image };
  }

  try {
    const url = new URL(image);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return {
        error: 'La fotografía debe tener una URL HTTP o HTTPS válida.'
      };
    }

    return { value: url.toString() };
  } catch {
    return {
      error: 'Introduce una URL válida o selecciona una fotografía cargada en Huellitas.'
    };
  }
}

export default function UserMascotaEditar() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadPet() {
      setLoading(true);
      setError('');

      try {
        const { data } = await api.get(`/user/mascotas/${id}`);

        if (cancelled) return;

        setForm({
          nombre: data.nombre || '',
          especie: data.especie || 'PERRO',
          raza: data.raza || '',
          sexo: data.sexo || 'MACHO',
          edad: String(data.edad ?? 0),
          vacunado:
            String(data.vacunado || 'NO').toUpperCase() === 'SI'
              ? 'SI'
              : 'NO',
          caracteristicas: data.caracteristicas || '',
          foto: data.foto || '',
          mostrar_contacto_qr:
            Boolean(
              data.mostrar_contacto_qr === true ||
              data.mostrar_contacto_qr === 1 ||
              data.mostrar_contacto_qr === '1'
            )
        });

        setPhotoPreview(data.foto || '');
      } catch (e) {
        if (!cancelled) {
          setError(
            e.response?.data?.message ||
            'No se pudieron cargar los datos de la mascota.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) {
      loadPet();
    } else {
      setError('No se recibió el identificador de la mascota.');
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  function change(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (error) setError('');
  }

  async function uploadPetPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Selecciona una imagen JPG, PNG o WEBP.');
      return;
    }

    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      setError('La imagen original no puede superar los 15 MB.');
      return;
    }

    setError('');
    setUploadingPhoto(true);

    try {
      const optimized = await prepareImageForUpload(file);

      const { data } = await api.post(
        '/user/uploads/imagen',
        optimized
      );

      if (!data?.url || typeof data.url !== 'string') {
        throw new Error(
          'El servidor no devolvió la dirección de la imagen.'
        );
      }

      const validatedImage = validateImageUrl(data.url);

      if (validatedImage.error) {
        throw new Error(validatedImage.error);
      }

      setForm((current) => ({
        ...current,
        foto: validatedImage.value
      }));

      setPhotoPreview(validatedImage.value);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudo subir la fotografía.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  function validateForm() {
    const nombreResult = validateText(form.nombre, {
      required: true,
      minLength: 2,
      maxLength: 100,
      requireLetters: true
    });

    if (nombreResult.error) return nombreResult.error;

    if (!NAME_RE.test(nombreResult.value)) {
      return 'El nombre solo puede contener letras, espacios, guiones y apóstrofes.';
    }

    if (!VALID_SPECIES.includes(form.especie)) {
      return 'Selecciona una especie válida.';
    }

    const razaResult = validateText(form.raza, {
      maxLength: 100,
      requireLetters: true
    });

    if (razaResult.error) return razaResult.error;

    if (razaResult.value && !BREED_RE.test(razaResult.value)) {
      return 'La raza contiene caracteres no permitidos.';
    }

    if (!VALID_SEXES.includes(form.sexo)) {
      return 'Selecciona un sexo válido.';
    }

    const edadText = String(form.edad).trim();

    if (!/^(0|[1-9]\d*)$/.test(edadText)) {
      return 'La edad debe ser un número entero válido.';
    }

    const edad = Number(edadText);

    if (!Number.isSafeInteger(edad) || edad < 0 || edad > 40) {
      return 'La edad debe estar entre 0 y 40 años.';
    }

    if (!VALID_VACCINATION.includes(form.vacunado)) {
      return 'Selecciona una opción válida para la vacunación.';
    }

    const caracteristicasResult = validateText(
      form.caracteristicas,
      {
        maxLength: 1000,
        minLength: 3,
        requireLetters: true,
        allowNewLines: true
      }
    );

    if (caracteristicasResult.error) {
      return caracteristicasResult.error;
    }

    if (caracteristicasResult.value) {
      if (!CHARACTERISTICS_RE.test(caracteristicasResult.value)) {
        return 'Las características solo pueden contener letras y espacios. No se permiten números ni caracteres especiales.';
      }

      const letters =
        caracteristicasResult.value.match(/\p{L}/gu) || [];

      if (letters.length < 3) {
        return 'Las características deben contener al menos 3 letras.';
      }
    }

    const fotoResult = validateImageUrl(form.foto);

    if (fotoResult.error) return fotoResult.error;

    return {
      nombre: nombreResult.value,
      especie: form.especie,
      raza: razaResult.value,
      sexo: form.sexo,
      edad,
      vacunado: form.vacunado,
      caracteristicas: caracteristicasResult.value,
      foto: fotoResult.value,
      mostrar_contacto_qr: form.mostrar_contacto_qr ? 1 : 0
    };
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (saving || uploadingPhoto || loading) return;

    const validated = validateForm();

    if (typeof validated === 'string') {
      setError(validated);
      return;
    }

    setSaving(true);

    try {
      const { data } = await api.put(
        `/user/mascotas/${id}`,
        validated
      );

      navigate(`/usuario/mascotas/${id}`, {
        replace: true,
        state: {
          message: data?.message || 'Mascota actualizada correctamente.'
        }
      });
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudieron guardar los cambios de la mascota.'
      );
    } finally {
      setSaving(false);
    }
  }

  function removePhoto() {
    setForm((current) => ({
      ...current,
      foto: ''
    }));

    setPhotoPreview('');
  }

  if (loading) {
    return (
      <div className="loading" role="status">
        Cargando datos de la mascota...
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <PawPrint size={24} />
            <h1>Editar mascota</h1>
          </div>

          <p>
            Modifica la información de tu mascota y guarda los cambios.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <div className="panel form-panel">
        <form onSubmit={submit} className="form-grid user-form">
          <label>
            Nombre de la mascota

            <input
              name="nombre"
              value={form.nombre}
              onChange={change}
              maxLength={100}
              autoComplete="off"
              required
            />

            <small>
              Solo letras, espacios, guiones y apóstrofes.
            </small>
          </label>

          <label>
            Especie

            <select
              name="especie"
              value={form.especie}
              onChange={change}
            >
              <option value="PERRO">Perro</option>
              <option value="GATO">Gato</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>

          <label>
            Raza

            <input
              name="raza"
              value={form.raza}
              onChange={change}
              maxLength={100}
              placeholder="Opcional"
            />
          </label>

          <label>
            Sexo

            <select
              name="sexo"
              value={form.sexo}
              onChange={change}
            >
              <option value="MACHO">Macho</option>
              <option value="HEMBRA">Hembra</option>
            </select>
          </label>

          <label>
            Edad

            <input
              name="edad"
              type="number"
              min="0"
              max="40"
              step="1"
              value={form.edad}
              onChange={change}
              required
            />

            <small>Edad expresada en años.</small>
          </label>

          <label>
            Vacunado

            <select
              name="vacunado"
              value={form.vacunado}
              onChange={change}
            >
              <option value="SI">Sí</option>
              <option value="NO">No</option>
            </select>
          </label>

          <label className="full-span">
            Características

            <textarea
              name="caracteristicas"
              value={form.caracteristicas}
              onChange={change}
              rows="4"
              maxLength={1000}
              placeholder="Color, tamaño, señas particulares, etc."
            />

            <small>
              Solo letras, tildes, espacios y saltos de línea.
              {' '}{form.caracteristicas.length}/1000 caracteres.
              No se permiten números ni caracteres especiales.
            </small>
          </label>

          <div className="full-span">
            <span className="field-label">
              Fotografía de la mascota
            </span>

            <label className="report-photo-uploader">
              <Camera size={24} />

              <strong>
                {uploadingPhoto
                  ? 'Subiendo fotografía...'
                  : 'Cambiar fotografía'}
              </strong>

              <span>
                JPG, PNG o WEBP · máximo 15 MB
              </span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadPetPhoto}
                disabled={uploadingPhoto || saving}
              />
            </label>

            <label className="pet-image-url-label">
              URL de imagen

              <input
                name="foto"
                type="url"
                value={form.foto}
                onChange={(event) => {
                  change(event);
                  setPhotoPreview(event.target.value);
                }}
                placeholder="https://..."
              />
            </label>

            {(photoPreview || form.foto) && (
              <div className="report-photo-preview">
                <img
                  src={mediaUrl(photoPreview || form.foto)}
                  alt="Fotografía de la mascota"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />

                <span>Fotografía actual</span>

                <button
                  type="button"
                  className="link-button"
                  onClick={removePhoto}
                  disabled={saving || uploadingPhoto}
                >
                  <X size={14} />
                  Quitar foto
                </button>
              </div>
            )}
          </div>

          <label className="full-span checkbox-label">
            <input
              type="checkbox"
              name="mostrar_contacto_qr"
              checked={form.mostrar_contacto_qr}
              onChange={change}
            />

            Mostrar mis datos de contacto al escanear el QR.
          </label>

          <div className="form-actions full-span">
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate(`/usuario/mascotas/${id}`)}
              disabled={saving || uploadingPhoto}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={saving || uploadingPhoto}
            >
              <Save size={17} />

              {saving
                ? 'Guardando cambios...'
                : uploadingPhoto
                  ? 'Subiendo fotografía...'
                  : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
