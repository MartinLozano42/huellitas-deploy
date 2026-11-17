import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  PawPrint,
  Save,
  X
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

const NAME_RE = /^[\p{L}][\p{L}\s'-]{0,99}$/u;
const IMAGE_URL_RE = /^https?:\/\/\S+$/i;
const LOCAL_IMAGE_RE = /^\/uploads\/images\/[A-Za-z0-9._-]+$/;

const INITIAL_FORM = {
  nombre: '',
  especie: 'PERRO',
  raza: '',
  sexo: 'MACHO',
  edad: '0',
  vacunado: 'SI',
  caracteristicas: '',
  foto: ''
};

export default function UserMascotaEditar() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');

  const loadPet = useCallback(async () => {
    try {
      setError('');

      const { data } = await api.get(`/user/mascotas/${id}`);

      setForm({
        nombre: data.nombre || '',
        especie: data.especie || 'PERRO',
        raza: data.raza || '',
        sexo: data.sexo || 'MACHO',
        edad: String(data.edad ?? 0),
        vacunado: String(data.vacunado || 'SI').toUpperCase(),
        caracteristicas: data.caracteristicas || '',
        foto: data.foto || ''
      });

      setPreview(data.foto || '');
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo cargar la información de la mascota.'
      );
    }
  }, [id]);

  useEffect(() => {
    loadPet();
  }, [loadPet]);

  function change(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value
    }));

    if (error) setError('');
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Selecciona una imagen JPG, PNG o WEBP.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('La imagen original no puede superar los 15 MB.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const optimized = await prepareImageForUpload(file);
      const { data } = await api.post('/user/uploads/imagen', optimized);

      if (!data?.url) {
        throw new Error('El servidor no devolvió la dirección de la imagen.');
      }

      setForm((current) => ({
        ...current,
        foto: data.url
      }));

      setPreview(data.url);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudo subir la fotografía.'
      );
    } finally {
      setUploading(false);
    }
  }

  function validateForm() {
    const nombre = form.nombre.trim().replace(/\s+/g, ' ');
    const raza = form.raza.trim();
    const caracteristicas = form.caracteristicas.trim();
    const foto = form.foto.trim();
    const edad = Number(form.edad);

    if (!nombre) {
      return 'El nombre de la mascota es obligatorio.';
    }

    if (!NAME_RE.test(nombre)) {
      return 'El nombre solo puede contener letras, espacios, guiones y apóstrofes.';
    }

    if (!['PERRO', 'GATO', 'OTRO'].includes(form.especie)) {
      return 'Selecciona una especie válida.';
    }

    if (raza.length > 100) {
      return 'La raza no puede superar los 100 caracteres.';
    }

    if (!['MACHO', 'HEMBRA'].includes(form.sexo)) {
      return 'Selecciona un sexo válido.';
    }

    if (!Number.isInteger(edad) || edad < 0 || edad > 40) {
      return 'La edad debe ser un número entero entre 0 y 40.';
    }

    if (!['SI', 'NO'].includes(form.vacunado)) {
      return 'Selecciona una opción válida para la vacunación.';
    }

    if (caracteristicas.length > 1000) {
      return 'Las características no pueden superar los 1000 caracteres.';
    }

    if (
      foto &&
      !IMAGE_URL_RE.test(foto) &&
      !LOCAL_IMAGE_RE.test(foto)
    ) {
      return 'Introduce una URL válida o una fotografía cargada en Huellitas.';
    }

    return {
      nombre,
      raza,
      caracteristicas,
      foto,
      edad
    };
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (loading || uploading) return;

    const validated = validateForm();

    if (typeof validated === 'string') {
      setError(validated);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...form,
        ...validated
      };

      const { data } = await api.put(
        `/user/mascotas/${id}`,
        payload
      );

      navigate(`/usuario/mascotas/${id}`, {
        state: {
          message: data.message || 'Mascota actualizada correctamente.'
        }
      });
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudieron actualizar los datos de la mascota.'
      );
    } finally {
      setLoading(false);
    }
  }

  function removePhoto() {
    setForm((current) => ({
      ...current,
      foto: ''
    }));

    setPreview('');
  }

  if (!form) {
    return (
      <div>
        {error ? (
          <div>
            <div className="alert error" role="alert">
              {error}
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate('/usuario/mascotas')}
            >
              Volver a mis mascotas
            </button>
          </div>
        ) : (
          <div className="loading">
            Cargando información de la mascota...
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <button
            className="icon-button"
            type="button"
            onClick={() => navigate(`/usuario/mascotas/${id}`)}
            aria-label="Volver al detalle"
          >
            <ArrowLeft size={17} />
          </button>

          <div className="page-title-row">
            <PawPrint size={24} />
            <h1>Editar mascota</h1>
          </div>

          <p>
            Actualiza los datos de tu mascota. Su identificación QR existente se conserva.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <div className="panel form-panel">
        <form
          className="form-grid user-form"
          onSubmit={submit}
        >
          <label>
            Nombre de la mascota

            <input
              name="nombre"
              value={form.nombre}
              onChange={change}
              maxLength={100}
              placeholder="Ej. Max"
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
              rows="4"
              maxLength={1000}
              value={form.caracteristicas}
              onChange={change}
              placeholder="Color, tamaño, señas particulares, etc."
            />

            <small>
              {form.caracteristicas.length}/1000 caracteres
            </small>
          </label>

          <div className="full-span">
            <span className="field-label">
              Fotografía
            </span>

            <label className="report-photo-uploader">
              <Camera size={24} />

              <strong>
                {uploading
                  ? 'Subiendo fotografía...'
                  : 'Cambiar fotografía'}
              </strong>

              <span>
                JPG, PNG o WEBP · máximo 15 MB
              </span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadPhoto}
                disabled={uploading || loading}
              />
            </label>

            <label className="pet-image-url-label">
              O pega una URL de imagen existente

              <input
                name="foto"
                type="url"
                value={form.foto}
                onChange={(event) => {
                  change(event);
                  setPreview(event.target.value);
                }}
                placeholder="https://..."
              />
            </label>

            {preview && (
              <div className="report-photo-preview">
                <img
                  src={mediaUrl(preview)}
                  alt="Vista previa de la mascota"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />

                <span>Fotografía actual</span>

                <button
                  className="link-button"
                  type="button"
                  onClick={removePhoto}
                >
                  <X size={14} />
                  Quitar foto
                </button>
              </div>
            )}
          </div>

          <div className="form-actions full-span">
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate(`/usuario/mascotas/${id}`)}
              disabled={loading || uploading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={loading || uploading}
            >
              <Save size={17} />

              {loading
                ? 'Guardando...'
                : uploading
                  ? 'Subiendo fotografía...'
                  : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
