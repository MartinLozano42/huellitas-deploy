import { useState } from 'react';
import { Camera, PawPrint, Save, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

export default function UserMascotaNueva() {
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');

  function change(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value
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

    if (file.size > 15 * 1024 * 1024) {
      setError('La imagen original no puede superar los 15 MB.');
      return;
    }

    setError('');
    setUploadingPhoto(true);

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

      setPhotoPreview(data.url);
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
      return 'Introduce una URL válida o selecciona una fotografía cargada en Huellitas.';
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

    if (loading || uploadingPhoto) return;

    const validated = validateForm();

    if (typeof validated === 'string') {
      setError(validated);
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/user/mascotas', {
        ...form,
        ...validated
      });

      if (!data?.mascota?.id) {
        throw new Error('La mascota se registró, pero el servidor no devolvió su identificador.');
      }

      navigate(`/usuario/mascotas/${data.mascota.id}`, {
        state: {
          message: data.message || 'Mascota registrada correctamente.'
        }
      });
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudo registrar la mascota.'
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

    setPhotoPreview('');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <PawPrint size={24} />
            <h1>Registrar mascota</h1>
          </div>

          <p>
            Completa los datos para crear la ficha de tu mascota.
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
              placeholder="Ej. Max"
              autoComplete="off"
              required
            />
            <small>Solo letras, espacios, guiones y apóstrofes.</small>
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
            <small>{form.caracteristicas.length}/1000 caracteres</small>
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
                  : 'Seleccionar fotografía'}
              </strong>

              <span>
                JPG, PNG o WEBP · máximo 15 MB
              </span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadPetPhoto}
                disabled={uploadingPhoto || loading}
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
                  setPhotoPreview(event.target.value);
                }}
                placeholder="https://..."
              />
            </label>

            {(photoPreview || form.foto) && (
              <div className="report-photo-preview">
                <img
                  src={mediaUrl(photoPreview || form.foto)}
                  alt="Vista previa de la mascota"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />

                <span>Vista previa de la fotografía</span>

                <button
                  type="button"
                  className="link-button"
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
              onClick={() => navigate('/usuario/mascotas')}
              disabled={loading || uploadingPhoto}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={loading || uploadingPhoto}
            >
              <Save size={17} />

              {loading
                ? 'Guardando...'
                : uploadingPhoto
                  ? 'Subiendo fotografía...'
                  : 'Guardar mascota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
