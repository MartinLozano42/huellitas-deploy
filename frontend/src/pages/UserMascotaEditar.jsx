import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, PawPrint, Save, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

const NAME_RE = /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u;
const BREED_RE = /^[\p{L}][\p{L}\s'().-]{0,99}$/u;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LOCAL_IMAGE_RE = /^\/uploads\/images\/[A-Za-z0-9._-]+$/;

const ESPECIES = ['PERRO', 'GATO', 'OTRO'];
const SEXOS = ['MACHO', 'HEMBRA'];
const VACUNACION = ['SI', 'NO'];

function validateImage(value) {
  if (!value) return true;

  if (typeof value !== 'string' || value.length > 500) {
    return false;
  }

  if (LOCAL_IMAGE_RE.test(value)) return true;

  try {
    const url = new URL(value);

    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      url.hostname.includes('.') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export default function UserMascotaEditar() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    api.get(`/user/mascotas/${id}`)
      .then(({ data }) => {
        setForm({
          nombre: data.nombre || '',
          especie: data.especie || 'PERRO',
          raza: data.raza || '',
          sexo: data.sexo || 'MACHO',
          edad: String(data.edad ?? 0),
          vacunado: data.vacunado || 'SI',
          caracteristicas: data.caracteristicas || '',
          foto: data.foto || '',
          mostrar_contacto_qr:
            Number(data.mostrar_contacto_qr) === 1
        });

        setPreview(data.foto || '');
      })
      .catch((e) => {
        setError(
          e.response?.data?.message ||
          'No se pudo cargar la mascota.'
        );
      });
  }, [id]);

  function change(e) {
    const { name, value, type, checked } = e.target;

    setForm((f) => ({
      ...f,
      [name]: type === 'checkbox' ? checked : value
    }));

    setError('');
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP.');
      return;
    }

    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      setError('La imagen no puede superar los 15 MB.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const optimized = await prepareImageForUpload(file);
      const { data } = await api.post('/user/uploads/imagen', optimized);

      if (!validateImage(data?.url) || !data?.url) {
        throw new Error('El servidor devolvió una dirección de imagen inválida.');
      }

      setForm((f) => ({
        ...f,
        foto: data.url
      }));

      setPreview(data.url);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'No se pudo subir la foto.'
      );
    } finally {
      setUploading(false);
    }
  }

  function validateForm() {
    const nombre = form.nombre.trim().replace(/\s+/g, ' ');
    const raza = form.raza.trim().replace(/\s+/g, ' ');
    const caracteristicas = form.caracteristicas.trim().replace(/\s+/g, ' ');
    const edadText = String(form.edad).trim();
    const foto = form.foto.trim();

    if (!nombre) {
      return 'El nombre de la mascota es obligatorio.';
    }

    if (nombre.length > 100 || !NAME_RE.test(nombre)) {
      return 'El nombre debe contener letras, espacios, guiones o apóstrofes. No se permiten números ni símbolos.';
    }

    if (!ESPECIES.includes(form.especie)) {
      return 'Selecciona una especie válida.';
    }

    if (raza.length > 100) {
      return 'La raza no puede superar los 100 caracteres.';
    }

    if (raza && !BREED_RE.test(raza)) {
      return 'La raza debe contener letras y no puede ser solamente números o símbolos.';
    }

    if (!SEXOS.includes(form.sexo)) {
      return 'Selecciona un sexo válido.';
    }

    if (!/^\d{1,2}$/.test(edadText)) {
      return 'La edad debe ser un número entero.';
    }

    const edad = Number(edadText);

    if (!Number.isInteger(edad) || edad < 0 || edad > 40) {
      return 'La edad debe estar entre 0 y 40 años.';
    }

    if (!VACUNACION.includes(form.vacunado)) {
      return 'Selecciona una opción válida de vacunación.';
    }

    if (caracteristicas.length > 1000) {
      return 'Las características no pueden superar los 1000 caracteres.';
    }

    if (CONTROL_RE.test(caracteristicas)) {
      return 'Las características contienen caracteres no permitidos.';
    }

    if (
      caracteristicas &&
      !/[\p{L}]/u.test(caracteristicas)
    ) {
      return 'Las características deben contener una descripción con letras.';
    }

    if (!validateImage(foto)) {
      return 'La dirección de la fotografía no es válida.';
    }

    return {
      nombre,
      raza,
      caracteristicas,
      edad,
      foto
    };
  }

  async function submit(e) {
    e.preventDefault();

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
        ...validated,
        mostrar_contacto_qr: form.mostrar_contacto_qr ? 1 : 0
      };

      const { data } = await api.put(
        `/user/mascotas/${id}`,
        payload
      );

      navigate(`/usuario/mascotas/${id}`, {
        state: { message: data.message }
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'No se pudo actualizar la mascota.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (!form) {
    return (
      <div>
        {error
          ? <div className="alert error">{error}</div>
          : <div className="loading">Cargando mascota...</div>
        }
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
          >
            <ArrowLeft size={17} />
          </button>

          <div className="page-title-row">
            <PawPrint size={24} />
            <h1>Editar mascota</h1>
          </div>

          <p>
            Actualiza los datos de tu mascota. Su QR existente se conserva.
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
          noValidate
        >

          <label>
            Nombre
            <input
              name="nombre"
              value={form.nombre}
              onChange={change}
              maxLength={100}
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
            />
            <small>Opcional. Introduce el nombre de la raza.</small>
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
            <small>Edad en años, de 0 a 40.</small>
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
            />
            <small>
              {form.caracteristicas.length}/1000 caracteres.
              Describe las características con palabras.
            </small>
          </label>

          <div className="full-span panel" style={{ padding: '18px' }}>
            <div className="page-title-row">
              <ShieldCheck size={22} />
              <h3>Privacidad del código QR</h3>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginTop: '16px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                name="mostrar_contacto_qr"
                checked={form.mostrar_contacto_qr}
                onChange={change}
                style={{
                  width: '20px',
                  height: '20px',
                  marginTop: '3px',
                  flexShrink: 0
                }}
              />

              <span>
                <strong>
                  Mostrar mi nombre y teléfono al escanear el QR
                </strong>

                <small style={{ display: 'block', marginTop: '6px' }}>
                  Si activas esta opción, cualquier persona que escanee
                  el código QR podrá consultar tu nombre y número de
                  teléfono para contactarte.
                </small>
              </span>
            </label>

            <div
              className="alert"
              style={{ marginTop: '14px', marginBottom: 0 }}
            >
              {form.mostrar_contacto_qr
                ? 'Tu información de contacto estará visible públicamente.'
                : 'Tu información de contacto permanecerá privada.'}
            </div>
          </div>

          <div className="full-span">
            <span className="field-label">Fotografía</span>

            <label className="report-photo-uploader">
              <Camera size={24} />

              <strong>
                {uploading
                  ? 'Subiendo fotografía…'
                  : 'Cambiar fotografía'
                }
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

            {preview && (
              <div className="report-photo-preview">
                <img
                  src={mediaUrl(preview)}
                  alt="Vista previa de la mascota"
                />

                <span>Foto actual</span>

                <button
                  className="link-button"
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, foto: '' }));
                    setPreview('');
                  }}
                >
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
              className="primary-button"
              disabled={loading || uploading}
            >
              <Save size={17} />

              {loading ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
