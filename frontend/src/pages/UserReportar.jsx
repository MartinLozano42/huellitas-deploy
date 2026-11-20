```jsx
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, MapPin, Send } from 'lucide-react';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

const NAME_RE = /^[\p{L}][\p{L}\s'-]{0,99}$/u;
const BREED_RE = /^[\p{L}][\p{L}\s'().-]{0,99}$/u;

// Ubicación: solamente letras, números y espacios.
const LOCATION_RE = /^[\p{L}\p{N}\s]+$/u;

// Descripción: solamente letras y espacios.
const DESCRIPTION_RE = /^[\p{L}\s]+$/u;

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const VALID_TYPES = ['PERDIDA', 'ENCONTRADA'];
const VALID_SPECIES = ['PERRO', 'GATO', 'OTRO'];
const VALID_SEXES = ['MACHO', 'HEMBRA'];

function validateCoordinates(latitud, longitud) {
  if (!latitud.trim() && !longitud.trim()) {
    return { latitud: null, longitud: null };
  }

  if (!latitud.trim() || !longitud.trim()) {
    return 'Debes completar ambas coordenadas o dejar las dos vacías.';
  }

  const decimal = /^-?(?:\d{1,3})(?:\.\d{1,8})?$/;

  if (!decimal.test(latitud.trim()) || !decimal.test(longitud.trim())) {
    return 'Las coordenadas deben contener números decimales válidos.';
  }

  const lat = Number(latitud);
  const lon = Number(longitud);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return 'La latitud debe estar entre -90 y 90.';
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return 'La longitud debe estar entre -180 y 180.';
  }

  return { latitud: lat, longitud: lon };
}

function validateReport(form) {
  const ubicacion = form.ubicacion.trim().replace(/\s+/g, ' ');
  const descripcion = form.descripcion.trim().replace(/\s+/g, ' ');
  const nombre = form.nombre.trim().replace(/\s+/g, ' ');
  const raza = form.raza.trim().replace(/\s+/g, ' ');

  if (!VALID_TYPES.includes(form.tipo)) {
    return 'Selecciona un tipo de reporte válido.';
  }

  if (!ubicacion) {
    return 'La ubicación es obligatoria.';
  }

  if (
    ubicacion.length < 3 ||
    ubicacion.length > 255 ||
    !LOCATION_RE.test(ubicacion) ||
    !/\p{L}/u.test(ubicacion)
  ) {
    return 'La ubicación debe tener entre 3 y 255 caracteres y solamente puede contener letras, números y espacios.';
  }

  const coordinates = validateCoordinates(form.latitud, form.longitud);

  if (typeof coordinates === 'string') {
    return coordinates;
  }

  if (descripcion.length > 4000) {
    return 'La descripción no puede superar los 4000 caracteres.';
  }

  if (CONTROL_RE.test(descripcion)) {
    return 'La descripción contiene caracteres de control no permitidos.';
  }

  if (descripcion && !DESCRIPTION_RE.test(descripcion)) {
    return 'La descripción solamente puede contener letras y espacios. No se permiten números ni símbolos.';
  }

  if (form.tipo === 'ENCONTRADA' && !form.mascotaId) {
    if (!nombre || !NAME_RE.test(nombre)) {
      return 'El nombre provisional debe contener letras, espacios, guiones o apóstrofes.';
    }

    if (!VALID_SPECIES.includes(form.especie)) {
      return 'Selecciona una especie válida.';
    }

    if (raza.length > 100 || (raza && !BREED_RE.test(raza))) {
      return 'La raza debe contener letras y no puede ser solamente números o símbolos.';
    }

    if (form.sexo && !VALID_SEXES.includes(form.sexo)) {
      return 'Selecciona un sexo válido.';
    }

    if (String(form.edad).trim() !== '') {
      if (!/^\d{1,2}$/.test(String(form.edad).trim())) {
        return 'La edad debe ser un número entero.';
      }

      const edad = Number(form.edad);

      if (!Number.isInteger(edad) || edad < 0 || edad > 40) {
        return 'La edad debe estar entre 0 y 40 años.';
      }
    }
  }

  return {
    ubicacion,
    descripcion: descripcion || null,
    nombre,
    raza,
    ...coordinates
  };
}

export default function UserReportar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const scannedPet = location.state?.pet || null;

  const [tipo, setTipo] = useState(
    (searchParams.get('tipo') || 'PERDIDA').toUpperCase()
  );

  const [mascotas, setMascotas] = useState([]);
  const [mascotaId, setMascotaId] = useState(
    searchParams.get('mascota_id') || ''
  );

  const [nombre, setNombre] = useState(scannedPet?.nombre || '');
  const [especie, setEspecie] = useState(scannedPet?.especie || 'PERRO');
  const [raza, setRaza] = useState(scannedPet?.raza || '');
  const [sexo, setSexo] = useState(scannedPet?.sexo || '');
  const [edad, setEdad] = useState(scannedPet?.edad ?? '');

  const [descripcion, setDescripcion] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');

  const [foto, setFoto] = useState('');
  const [preview, setPreview] = useState(scannedPet?.foto || '');

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/user/mascotas')
      .then(({ data }) => setMascotas(data))
      .catch(() => setMascotas([]));
  }, []);

  const selectedPet = useMemo(
    () => mascotas.find((m) => String(m.id) === String(mascotaId)),
    [mascotas, mascotaId]
  );

  useEffect(() => {
    if (tipo === 'PERDIDA' && !mascotaId && mascotas.length) {
      setMascotaId(String(mascotas[0].id));
    }
  }, [tipo, mascotas, mascotaId]);

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setError('');
    setMessage('');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Elige una imagen JPG, PNG o WEBP.');
      return;
    }

    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      setError('La imagen original no puede superar los 15 MB.');
      return;
    }

    setUploading(true);

    try {
      const optimized = await prepareImageForUpload(file);

      const { data: result } = await api.post(
        '/user/uploads/imagen',
        optimized
      );

      if (typeof result?.url !== 'string' || !result.url.trim()) {
        throw new Error('El servidor no devolvió una dirección de imagen válida.');
      }

      setFoto(result.url);
      setPreview(result.url);
      setMessage('Fotografía optimizada y guardada correctamente.');
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudo subir la imagen.'
      );
    } finally {
      setUploading(false);
    }
  }

  function useCurrentLocation() {
    setError('');
    setMessage('');

    if (!navigator.geolocation) {
      setError('Este navegador no permite obtener la ubicación.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitud(String(coords.latitude.toFixed(7)));
        setLongitud(String(coords.longitude.toFixed(7)));
        setMessage('Ubicación obtenida. Escribe también una referencia del lugar.');
      },
      () => {
        setError(
          'No se pudo obtener la ubicación. Revisa los permisos o introduce las coordenadas manualmente.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  }

  async function submit(event) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (busy || uploading) return;

    if (tipo === 'PERDIDA' && !mascotaId) {
      setError('Selecciona una de tus mascotas.');
      return;
    }

    const validated = validateReport({
      tipo,
      mascotaId,
      nombre,
      especie,
      raza,
      sexo,
      edad,
      descripcion,
      ubicacion,
      latitud,
      longitud
    });

    if (typeof validated === 'string') {
      setError(validated);
      return;
    }

    const payload = {
      tipo,
      descripcion: validated.descripcion,
      ubicacion: validated.ubicacion,
      latitud: validated.latitud,
      longitud: validated.longitud,
      foto: foto || null
    };

    if (tipo === 'PERDIDA') {
      payload.mascota_id = Number(mascotaId);
    } else if (mascotaId) {
      payload.mascota_id = Number(mascotaId);
    } else {
      payload.nombre_mascota = validated.nombre;
      payload.especie_mascota = especie;
      payload.raza_mascota = validated.raza;
      payload.sexo_mascota = sexo || null;
      payload.edad_mascota =
        String(edad).trim() === '' ? null : Number(edad);
    }

    setBusy(true);

    try {
      const { data } = await api.post('/user/reportes', payload);

      navigate('/usuario/reportes', {
        state: {
          message: data.message,
          reporteId: data.reporte_id
        }
      });
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo publicar el reporte.'
      );
    } finally {
      setBusy(false);
    }
  }

  const latitudeNumber = latitud.trim() ? Number(latitud) : NaN;
  const longitudeNumber = longitud.trim() ? Number(longitud) : NaN;

  const coordinatesAreValid =
    Number.isFinite(latitudeNumber) &&
    Number.isFinite(longitudeNumber) &&
    latitudeNumber >= -90 &&
    latitudeNumber <= 90 &&
    longitudeNumber >= -180 &&
    longitudeNumber <= 180;

  const mapDelta = 0.012;

  const mapBounds = coordinatesAreValid
    ? [
        longitudeNumber - mapDelta,
        latitudeNumber - mapDelta,
        longitudeNumber + mapDelta,
        latitudeNumber + mapDelta
      ].join(',')
    : '';

  const mapPreviewUrl = coordinatesAreValid
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(mapBounds)}&layer=mapnik&marker=${latitudeNumber},${longitudeNumber}`
    : '';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reportar mascota</h1>
          <p>
            Publica un aviso de pérdida o ayuda reportando una mascota encontrada.
          </p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <form
        className="panel form-panel user-report-form"
        onSubmit={submit}
        noValidate
      >
        <div className="form-grid">

          <label>
            Tipo de reporte

            <select
              value={tipo}
              onChange={(e) => {
                const nextType = e.target.value;

                setTipo(nextType);
                setError('');

                if (
                  nextType === 'ENCONTRADA' &&
                  !searchParams.get('mascota_id')
                ) {
                  setMascotaId('');
                }

                if (
                  nextType === 'PERDIDA' &&
                  mascotaId &&
                  !mascotas.some((m) => String(m.id) === String(mascotaId))
                ) {
                  setMascotaId('');
                }
              }}
            >
              <option value="PERDIDA">Mascota perdida</option>
              <option value="ENCONTRADA">Mascota encontrada</option>
            </select>
          </label>

          {tipo === 'PERDIDA' ? (
            <label className="full-span">
              Selecciona tu mascota

              <select
                required
                value={mascotaId}
                onChange={(e) => setMascotaId(e.target.value)}
              >
                <option value="">Seleccionar mascota</option>

                {mascotas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} · {m.especie}
                  </option>
                ))}
              </select>

              {mascotas.length === 0 && (
                <small>
                  Primero registra una mascota en «Mis mascotas».
                </small>
              )}
            </label>
          ) : mascotaId ? (
            <div className="form-info full-span">
              <strong>Mascota identificada</strong>

              <span>
                {scannedPet?.nombre ||
                  selectedPet?.nombre ||
                  'Mascota vinculada a un QR'}
              </span>

              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setMascotaId('');
                  setNombre('');
                }}
              >
                Reportar sin vincular a una mascota registrada
              </button>
            </div>
          ) : (
            <>
              <label>
                Nombre provisional

                <input
                  required
                  maxLength={100}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Perrito café"
                />
              </label>

              <label>
                Especie

                <select
                  value={especie}
                  onChange={(e) => setEspecie(e.target.value)}
                >
                  <option value="PERRO">Perro</option>
                  <option value="GATO">Gato</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>

              <label>
                Raza

                <input
                  value={raza}
                  maxLength={100}
                  onChange={(e) => setRaza(e.target.value)}
                />
              </label>

              <label>
                Sexo

                <select
                  value={sexo}
                  onChange={(e) => setSexo(e.target.value)}
                >
                  <option value="">No se sabe</option>
                  <option value="MACHO">Macho</option>
                  <option value="HEMBRA">Hembra</option>
                </select>
              </label>

              <label>
                Edad aproximada

                <input
                  type="number"
                  min="0"
                  max="40"
                  step="1"
                  value={edad}
                  onChange={(e) => setEdad(e.target.value)}
                />
              </label>
            </>
          )}

          <label className="full-span">
            {tipo === 'PERDIDA'
              ? 'Última ubicación conocida'
              : 'Lugar donde la encontraste'}

            <input
              required
              maxLength={255}
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Barrio, plaza, calle o referencia"
            />

            <small>
              Introduce una dirección o referencia reconocible.
            </small>
          </label>

          <div className="coordinate-row full-span">
            <label>
              Latitud (opcional)

              <input
                inputMode="decimal"
                value={latitud}
                onChange={(e) => setLatitud(e.target.value)}
                placeholder="-17.3935"
                maxLength={20}
              />
            </label>

            <label>
              Longitud (opcional)

              <input
                inputMode="decimal"
                value={longitud}
                onChange={(e) => setLongitud(e.target.value)}
                placeholder="-66.1570"
                maxLength={20}
              />
            </label>

            <button
              className="secondary-button"
              type="button"
              onClick={useCurrentLocation}
            >
              <MapPin size={15} />
              Usar mi ubicación
            </button>
          </div>

          {mapPreviewUrl && (
            <div className="full-span report-map-preview">
              <span className="field-label">
                Vista previa de la ubicación
              </span>

              <iframe
                title="Mapa de ubicación del reporte"
                src={mapPreviewUrl}
                loading="lazy"
                referrerPolicy="no-referrer"
              />

              <a
                href={`https://www.openstreetmap.org/?mlat=${latitudeNumber}&mlon=${longitudeNumber}#map=16/${latitudeNumber}/${longitudeNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir mapa en una pestaña nueva
              </a>
            </div>
          )}

          <label className="full-span">
            Descripción

            <textarea
              rows="4"
              maxLength={4000}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe características, contexto o información útil para identificarla."
            />

            <small>
              {descripcion.length}/4000 caracteres.
            </small>
          </label>

          <div className="full-span">
            <span className="field-label">
              Fotografía (opcional)
            </span>

            <label className="report-photo-uploader">
              <Camera size={24} />

              <strong>
                {uploading
                  ? 'Subiendo fotografía…'
                  : 'Seleccionar fotografía'}
              </strong>

              <span>
                JPG, PNG o WEBP · se optimiza antes de subir
              </span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadPhoto}
                disabled={uploading}
              />
            </label>

            {preview && (
              <div className="report-photo-preview">
                <img
                  src={mediaUrl(preview)}
                  alt="Vista previa de la mascota"
                />

                <span>
                  {foto
                    ? 'Fotografía cargada'
                    : 'Imagen de la mascota identificada'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/usuario/reportes')}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={
              busy ||
              uploading ||
              (tipo === 'PERDIDA' && !mascotaId)
            }
          >
            <Send size={16} />

            {busy ? 'Publicando…' : 'Publicar aviso'}
          </button>
        </div>
      </form>
    </div>
  );
}
```
