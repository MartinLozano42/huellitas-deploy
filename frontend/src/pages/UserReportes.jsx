import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  MapPin,
  MessageCircle,
  PawPrint,
  PlusCircle,
  Search,
  Send,
  LocateFixed,
  Share2
} from 'lucide-react';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

const LOCATION_RE =
  /^[\p{L}\p{N}][\p{L}\p{N}\s.,#°ºª'()/\-]{1,254}$/u;

const COORDINATE_RE = /^-?(?:\d{1,3})(?:\.\d{1,8})?$/;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const DESCRIPTION_CONTENT_RE = /[\p{L}\p{N}]/u;

function normalizeText(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateLocation(value) {
  const location = normalizeText(value);

  if (location.length < 3 || location.length > 255) {
    return 'La ubicación debe tener entre 3 y 255 caracteres.';
  }

  if (!LOCATION_RE.test(location)) {
    return 'La ubicación contiene caracteres no permitidos.';
  }

  return '';
}

function validateDescription(value) {
  const description = normalizeText(value);

  if (description.length > 2000) {
    return 'La descripción no puede superar los 2000 caracteres.';
  }

  if (description && CONTROL_CHAR_RE.test(description)) {
    return 'La descripción contiene caracteres no permitidos.';
  }

  if (description && !DESCRIPTION_CONTENT_RE.test(description)) {
    return 'La descripción debe contener letras o números.';
  }

  return '';
}

function validateCoordinate(value, label, min, max) {
  const text = String(value ?? '').trim();

  if (!text) return '';

  if (!COORDINATE_RE.test(text)) {
    return `${label} debe ser un número decimal válido.`;
  }

  const number = Number(text);

  if (!Number.isFinite(number) || number < min || number > max) {
    return `${label} debe estar entre ${min} y ${max}.`;
  }

  return '';
}

function validateSighting(form) {
  const locationError = validateLocation(form.ubicacion);
  if (locationError) return locationError;

  const descriptionError = validateDescription(form.descripcion);
  if (descriptionError) return descriptionError;

  const latitude = String(form.latitud ?? '').trim();
  const longitude = String(form.longitud ?? '').trim();

  if (Boolean(latitude) !== Boolean(longitude)) {
    return 'Completa latitud y longitud, o deja ambos campos vacíos.';
  }

  const latitudeError = validateCoordinate(
    latitude,
    'La latitud',
    -90,
    90
  );

  if (latitudeError) return latitudeError;

  const longitudeError = validateCoordinate(
    longitude,
    'La longitud',
    -180,
    180
  );

  if (longitudeError) return longitudeError;

  return '';
}

function formatDate(value) {
  if (!value) return 'Fecha no disponible';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('es-BO');
}

export default function UserReportes() {
  const navigate = useNavigate();
  const location = useLocation();

  const [publicRows, setPublicRows] = useState([]);
  const [mineRows, setMineRows] = useState([]);
  const [mine, setMine] = useState(false);

  const [estado, setEstado] = useState('ACTIVO');
  const [tipo, setTipo] = useState('');
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');

  const [sightingForId, setSightingForId] = useState(null);

  const [sightingForm, setSightingForm] = useState({
    ubicacion: '',
    descripcion: '',
    latitud: '',
    longitud: '',
    foto: ''
  });

  const [sightingPhotoPreview, setSightingPhotoPreview] = useState('');
  const [uploadingSightingPhoto, setUploadingSightingPhoto] = useState(false);
  const [sendingSighting, setSendingSighting] = useState(false);

  const [resolvedForShare, setResolvedForShare] = useState(null);

  const [sightingsForReportId, setSightingsForReportId] = useState(null);
  const [sightingRows, setSightingRows] = useState([]);
  const [loadingSightings, setLoadingSightings] = useState(false);

  const [mapForReportId, setMapForReportId] = useState(null);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const normalizedQuery = normalizeText(query).slice(0, 100);

      const [publicResult, myResult] = await Promise.all([
        api.get('/public/reportes', {
          params: {
            estado,
            tipo,
            q: normalizedQuery
          }
        }),
        api.get('/user/reportes')
      ]);

      setPublicRows(
        Array.isArray(publicResult.data) ? publicResult.data : []
      );

      setMineRows(
        Array.isArray(myResult.data) ? myResult.data : []
      );
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudieron cargar los avisos.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [estado, tipo]);

  useEffect(() => {
    const timer = setTimeout(load, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const rows = useMemo(() => {
    const normalizedQuery = normalizeText(query).toLocaleLowerCase('es');

    if (!mine) return publicRows;

    return mineRows.filter((report) => {
      const matchesStatus = estado
        ? report.estado === estado
        : true;

      const matchesType = tipo
        ? report.tipo === tipo
        : true;

      const searchableText = normalizeText(
        `${report.mascota || ''} ${report.ubicacion || ''} ${report.descripcion || ''}`
      ).toLocaleLowerCase('es');

      return (
        matchesStatus &&
        matchesType &&
        searchableText.includes(normalizedQuery)
      );
    });
  }, [mine, publicRows, mineRows, estado, tipo, query]);

  async function contact(report) {
    setBusyId(report.id);
    setError('');

    try {
      const { data } = await api.post('/user/conversaciones', {
        reporte_id: report.id
      });

      navigate(`/usuario/chat/${data.conversacion_id}`);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo iniciar el contacto.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSightings(report) {
    if (sightingsForReportId === report.id) {
      setSightingsForReportId(null);
      setSightingRows([]);
      return;
    }

    setSightingsForReportId(report.id);
    setSightingRows([]);
    setLoadingSightings(true);
    setError('');

    try {
      const { data } = await api.get(
        `/user/reportes/${report.id}/avistamientos`
      );

      setSightingRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudieron cargar los avistamientos.'
      );

      setSightingsForReportId(null);
    } finally {
      setLoadingSightings(false);
    }
  }

  function contactSighter(sighting) {
    navigate(
      `/usuario/chat?avistamiento_id=${encodeURIComponent(sighting.id)}`
    );
  }

  function startSighting(report) {
    setSightingForId(
      sightingForId === report.id ? null : report.id
    );

    setSightingForm({
      ubicacion: '',
      descripcion: '',
      latitud: '',
      longitud: '',
      foto: ''
    });

    setSightingPhotoPreview('');
    setError('');
    setMessage('');
  }

  function setCurrentSightingLocation() {
    setError('');

    if (!navigator.geolocation) {
      setError('Este navegador no permite obtener ubicación.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (
          !Number.isFinite(coords.latitude) ||
          !Number.isFinite(coords.longitude) ||
          coords.latitude < -90 ||
          coords.latitude > 90 ||
          coords.longitude < -180 ||
          coords.longitude > 180
        ) {
          setError('El navegador devolvió coordenadas no válidas.');
          return;
        }

        setSightingForm((current) => ({
          ...current,
          latitud: coords.latitude.toFixed(7),
          longitud: coords.longitude.toFixed(7)
        }));

        setMessage('Ubicación obtenida correctamente.');
      },
      () => {
        setError(
          'No se pudo obtener la ubicación. Revisa los permisos del navegador.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  }

  async function uploadSightingPhoto(event) {
    const input = event.target;
    const file = input.files?.[0];

    input.value = '';

    if (!file) return;

    setError('');
    setMessage('');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten fotografías JPG, PNG o WEBP.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('La fotografía original no puede superar los 15 MB.');
      return;
    }

    setUploadingSightingPhoto(true);

    try {
      const optimized = await prepareImageForUpload(file);

      const { data } = await api.post(
        '/user/uploads/imagen',
        optimized
      );

      if (
        !data?.url ||
        typeof data.url !== 'string' ||
        data.url.length > 500
      ) {
        throw new Error('El servidor devolvió una dirección de imagen no válida.');
      }

      setSightingForm((current) => ({
        ...current,
        foto: data.url
      }));

      setSightingPhotoPreview(data.url);
      setMessage('Fotografía del avistamiento guardada.');
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudo cargar la fotografía del avistamiento.'
      );
    } finally {
      setUploadingSightingPhoto(false);
    }
  }

  async function submitSighting(event, report) {
    event.preventDefault();

    setError('');
    setMessage('');

    const validationError = validateSighting(sightingForm);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (uploadingSightingPhoto) {
      setError('Espera a que termine de subir la fotografía.');
      return;
    }

    setSendingSighting(true);

    try {
      const payload = {
        ubicacion: normalizeText(sightingForm.ubicacion),
        descripcion: normalizeText(sightingForm.descripcion),
        latitud: sightingForm.latitud.trim() || null,
        longitud: sightingForm.longitud.trim() || null,
        foto: sightingForm.foto || null
      };

      const { data } = await api.post(
        `/user/reportes/${report.id}/avistamientos`,
        payload
      );

      setMessage(
        data.message || 'Avistamiento enviado al propietario.'
      );

      setSightingForId(null);

      setSightingForm({
        ubicacion: '',
        descripcion: '',
        latitud: '',
        longitud: '',
        foto: ''
      });

      setSightingPhotoPreview('');
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo enviar el avistamiento.'
      );
    } finally {
      setSendingSighting(false);
    }
  }

  async function resolve(report) {
    const prompt = report.tipo === 'PERDIDA'
      ? `¿Confirmas que encontraste a ${report.mascota || 'tu mascota'}? El aviso se resolverá y su estado volverá a EN CASA.`
      : `¿Confirmas que deseas resolver el reporte de ${report.mascota || 'esta mascota'}?`;

    if (!window.confirm(prompt)) return;

    setBusyId(report.id);
    setError('');
    setMessage('');

    try {
      const { data } = await api.patch(
        `/user/reportes/${report.id}/estado`,
        { estado: 'RESUELTO' }
      );

      setMessage(data.message);
      setResolvedForShare(report);

      await load();
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo resolver el reporte.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function shareResolvedCase() {
    if (!resolvedForShare) return;

    const petName = resolvedForShare.mascota || 'Una mascota';

    const shareData = {
      title: 'Reencuentro en Huellitas',
      text: `${petName} ya tiene su reporte actualizado en Huellitas. Gracias a quienes ayudan a reunir mascotas con sus familias.`,
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `${shareData.text} ${shareData.url}`
        );

        setMessage(
          'Texto del reencuentro copiado para compartir.'
        );
      } else {
        setError(
          'Este navegador no permite compartir ni copiar automáticamente el mensaje.'
        );
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError('No se pudo compartir el reencuentro.');
      }
    }
  }

  function changeSearch(value) {
    if (value.length > 100) {
      setError('La búsqueda no puede superar los 100 caracteres.');
      return;
    }

    if (CONTROL_CHAR_RE.test(value)) {
      setError('La búsqueda contiene caracteres no permitidos.');
      return;
    }

    setError('');
    setQuery(value);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Avisos y reportes</h1>
          <p>
            Encuentra avisos de mascotas perdidas y encontradas,
            o gestiona tus propios casos.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate('/usuario/reportar')}
        >
          <PlusCircle size={16} />
          Crear aviso
        </button>
      </div>

      {message && (
        <div className="alert success">{message}</div>
      )}

      {error && (
        <div className="alert error">{error}</div>
      )}

      {resolvedForShare && (
        <div className="resolved-share panel">
          <div>
            <strong>¡Caso actualizado!</strong>
            <span>
              También puedes compartir un mensaje de agradecimiento a la comunidad.
            </span>
          </div>

          <button
            className="secondary-button compact"
            onClick={shareResolvedCase}
          >
            <Share2 size={15} />
            Compartir historia
          </button>

          <button
            className="link-button"
            onClick={() => setResolvedForShare(null)}
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="report-toolbar panel">
        <div className="report-search">
          <Search size={17} />

          <input
            value={query}
            onChange={(e) => changeSearch(e.target.value)}
            maxLength={100}
            placeholder="Buscar por mascota, zona o descripción"
          />
        </div>

        <select
          aria-label="Filtrar por estado"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="ACTIVO">Activos</option>
          <option value="RESUELTO">Resueltos</option>
          <option value="CERRADO">Cerrados</option>
        </select>

        <select
          aria-label="Filtrar por tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="">Pérdida y hallazgo</option>
          <option value="PERDIDA">Perdidas</option>
          <option value="ENCONTRADA">Encontradas</option>
        </select>

        <div className="report-view-toggle">
          <button
            className={!mine ? 'selected' : ''}
            onClick={() => setMine(false)}
          >
            Comunidad
          </button>

          <button
            className={mine ? 'selected' : ''}
            onClick={() => setMine(true)}
          >
            Mis reportes
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Cargando avisos…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state panel">
          <PawPrint size={34} />

          <p>No hay avisos que coincidan con los filtros.</p>

          <button
            className="secondary-button"
            onClick={() => navigate('/usuario/reportar')}
          >
            Publicar un aviso
          </button>
        </div>
      ) : (
        <div className="report-feed">
          {rows.map((report) => {
            const isMine = mineRows.some(
              (ownedReport) =>
                Number(ownedReport.id) === Number(report.id)
            );

            const image = report.foto_mascota || report.foto;

            const hasValidCoordinates =
              Number.isFinite(Number(report.latitud)) &&
              Number.isFinite(Number(report.longitud)) &&
              report.latitud !== null &&
              report.longitud !== null &&
              Number(report.latitud) >= -90 &&
              Number(report.latitud) <= 90 &&
              Number(report.longitud) >= -180 &&
              Number(report.longitud) <= 180;

            return (
              <article
                className="community-report-card panel"
                key={report.id}
              >
                <div className="community-report-image">
                  {image ? (
                    <img
                      src={mediaUrl(image)}
                      alt={`Foto de ${report.mascota || 'mascota'}`}
                    />
                  ) : (
                    <PawPrint size={34} />
                  )}
                </div>

                <div className="community-report-main">
                  <div className="community-report-top">
                    <span
                      className={`report-type-pill ${
                        report.tipo === 'PERDIDA' ? 'lost' : 'found'
                      }`}
                    >
                      {report.tipo === 'PERDIDA'
                        ? 'MASCOTA PERDIDA'
                        : 'MASCOTA ENCONTRADA'}
                    </span>

                    <span
                      className={`simple-state ${String(
                        report.estado || ''
                      ).toLowerCase()}`}
                    >
                      {report.estado}
                    </span>
                  </div>

                  <h2>
                    {report.mascota || 'Mascota sin identificar'}
                  </h2>

                  <p className="community-report-meta">
                    {report.especie || 'Especie no especificada'}
                    {report.raza ? ` · ${report.raza}` : ''}
                    {report.edad != null
                      ? ` · ${report.edad} años`
                      : ''}
                  </p>

                  <p className="community-report-description">
                    {report.descripcion || 'No se agregó una descripción.'}
                  </p>

                  <div className="community-report-location">
                    <MapPin size={15} />

                    <span>
                      {report.ubicacion || 'Ubicación no especificada'}
                    </span>

                    {hasValidCoordinates && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          setMapForReportId(
                            mapForReportId === report.id
                              ? null
                              : report.id
                          )
                        }
                      >
                        {mapForReportId === report.id
                          ? 'Ocultar mapa'
                          : 'Ver mapa'}
                      </button>
                    )}
                  </div>

                  {mapForReportId === report.id &&
                    hasValidCoordinates && (
                      <div className="community-report-map">
                        <iframe
                          title={`Mapa de ${
                            report.mascota || 'la mascota'
                          }`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
                            [
                              Number(report.longitud) - 0.01,
                              Number(report.latitud) - 0.01,
                              Number(report.longitud) + 0.01,
                              Number(report.latitud) + 0.01
                            ].join(',')
                          )}&layer=mapnik&marker=${Number(
                            report.latitud
                          )},${Number(report.longitud)}`}
                        />

                        <a
                          href={`https://www.openstreetmap.org/?mlat=${report.latitud}&mlon=${report.longitud}#map=16/${report.latitud}/${report.longitud}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir mapa completo
                        </a>
                      </div>
                    )}

                  <small>
                    Publicado:{' '}
                    {formatDate(
                      report.fecha_reporte || report.created_at
                    )}
                  </small>

                  <div className="community-report-actions">
                    {report.estado === 'ACTIVO' && !isMine && (
                      <button
                        className="primary-button compact"
                        disabled={busyId === report.id}
                        onClick={() => contact(report)}
                      >
                        <MessageCircle size={15} />
                        {busyId === report.id
                          ? 'Abriendo…'
                          : 'Contactar'}
                      </button>
                    )}

                    {report.estado === 'ACTIVO' &&
                      report.tipo === 'PERDIDA' &&
                      !isMine && (
                        <button
                          className="secondary-button compact"
                          type="button"
                          onClick={() => startSighting(report)}
                        >
                          <MapPin size={15} />
                          Reportar avistamiento
                        </button>
                      )}

                    {mine &&
                      isMine &&
                      report.tipo === 'PERDIDA' && (
                        <button
                          className="secondary-button compact"
                          type="button"
                          onClick={() => toggleSightings(report)}
                        >
                          <MapPin size={15} />
                          {sightingsForReportId === report.id
                            ? 'Ocultar avistamientos'
                            : 'Ver avistamientos'}
                        </button>
                      )}

                    {mine &&
                      isMine &&
                      report.estado === 'ACTIVO' && (
                        <button
                          className="secondary-button compact"
                          disabled={busyId === report.id}
                          onClick={() => resolve(report)}
                        >
                          <CheckCircle size={15} />
                          {report.tipo === 'PERDIDA'
                            ? '¡Ya la encontré!'
                            : 'Marcar como resuelto'}
                        </button>
                      )}
                  </div>

                  {mine &&
                    isMine &&
                    sightingsForReportId === report.id && (
                      <div className="sighting-results">
                        <strong>
                          Avistamientos de {report.mascota || 'tu mascota'}
                        </strong>

                        {loadingSightings ? (
                          <span className="muted">
                            Cargando avistamientos…
                          </span>
                        ) : sightingRows.length === 0 ? (
                          <span className="muted">
                            Todavía no se han reportado avistamientos.
                          </span>
                        ) : (
                          sightingRows.map((sighting) => (
                            <div
                              className="sighting-result"
                              key={sighting.id}
                            >
                              <div>
                                <strong>
                                  {sighting.avistador ||
                                    'Usuario de Huellitas'}
                                </strong>

                                <span>{sighting.ubicacion}</span>

                                {sighting.descripcion && (
                                  <p>{sighting.descripcion}</p>
                                )}

                                {sighting.foto && (
                                  <img
                                    className="sighting-photo-thumb"
                                    src={mediaUrl(sighting.foto)}
                                    alt="Fotografía del avistamiento"
                                  />
                                )}

                                <small>
                                  {formatDate(sighting.created_at)}
                                </small>

                                {sighting.latitud != null &&
                                  sighting.longitud != null && (
                                    <a
                                      href={`https://www.google.com/maps?q=${sighting.latitud},${sighting.longitud}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Ver ubicación
                                    </a>
                                  )}
                              </div>

                              <button
                                className="primary-button compact"
                                type="button"
                                onClick={() => contactSighter(sighting)}
                              >
                                <MessageCircle size={14} />
                                Contactar
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                  {sightingForId === report.id && (
                    <form
                      className="sighting-form"
                      onSubmit={(event) =>
                        submitSighting(event, report)
                      }
                    >
                      <strong>
                        ¿Dónde viste a {report.mascota || 'esta mascota'}?
                      </strong>

                      <label>
                        Ubicación o referencia

                        <input
                          required
                          minLength={3}
                          maxLength={255}
                          value={sightingForm.ubicacion}
                          onChange={(event) =>
                            setSightingForm((current) => ({
                              ...current,
                              ubicacion: event.target.value
                            }))
                          }
                          placeholder="Barrio, calle, plaza o referencia"
                        />
                      </label>

                      <label>
                        Descripción adicional

                        <textarea
                          rows="2"
                          maxLength={2000}
                          value={sightingForm.descripcion}
                          onChange={(event) =>
                            setSightingForm((current) => ({
                              ...current,
                              descripcion: event.target.value
                            }))
                          }
                          placeholder="Hora aproximada, hacia dónde iba, estado de la mascota…"
                        />
                      </label>

                      <div className="coordinate-row">
                        <label>
                          Latitud

                          <input
                            inputMode="decimal"
                            maxLength={13}
                            value={sightingForm.latitud}
                            onChange={(event) =>
                              setSightingForm((current) => ({
                                ...current,
                                latitud: event.target.value
                              }))
                            }
                            placeholder="Opcional"
                          />
                        </label>

                        <label>
                          Longitud

                          <input
                            inputMode="decimal"
                            maxLength={13}
                            value={sightingForm.longitud}
                            onChange={(event) =>
                              setSightingForm((current) => ({
                                ...current,
                                longitud: event.target.value
                              }))
                            }
                            placeholder="Opcional"
                          />
                        </label>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={setCurrentSightingLocation}
                        >
                          <LocateFixed size={15} />
                          Mi ubicación
                        </button>
                      </div>

                      <label className="sighting-photo-uploader">
                        {uploadingSightingPhoto
                          ? 'Subiendo fotografía…'
                          : 'Adjuntar foto del avistamiento (opcional)'}

                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={uploadSightingPhoto}
                          disabled={uploadingSightingPhoto}
                        />
                      </label>

                      {sightingPhotoPreview && (
                        <div className="report-photo-preview">
                          <img
                            src={mediaUrl(sightingPhotoPreview)}
                            alt="Fotografía del avistamiento"
                          />

                          <span>Fotografía adjunta</span>

                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setSightingForm((current) => ({
                                ...current,
                                foto: ''
                              }));

                              setSightingPhotoPreview('');
                            }}
                          >
                            Quitar fotografía
                          </button>
                        </div>
                      )}

                      <div className="community-report-actions">
                        <button
                          className="primary-button compact"
                          type="submit"
                          disabled={
                            sendingSighting ||
                            uploadingSightingPhoto ||
                            !sightingForm.ubicacion.trim()
                          }
                        >
                          <Send size={15} />

                          {sendingSighting
                            ? 'Enviando…'
                            : 'Enviar al propietario'}
                        </button>

                        <button
                          type="button"
                          className="secondary-button compact"
                          onClick={() => {
                            setSightingForId(null);
                            setSightingPhotoPreview('');
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
