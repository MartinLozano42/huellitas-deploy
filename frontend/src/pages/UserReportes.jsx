import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, MapPin, MessageCircle, PawPrint, PlusCircle, Search, Send, LocateFixed, Share2 } from 'lucide-react';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

function formatDate(value) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-BO');
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
  const [sightingForm, setSightingForm] = useState({ ubicacion: '', descripcion: '', latitud: '', longitud: '', foto: '' });
  const [sightingPhotoPreview, setSightingPhotoPreview] = useState('');
  const [uploadingSightingPhoto, setUploadingSightingPhoto] = useState(false);
  const [sendingSighting, setSendingSighting] = useState(false);
  const [resolvedForShare, setResolvedForShare] = useState(null);
  const [sightingsForReportId, setSightingsForReportId] = useState(null);
  const [sightingRows, setSightingRows] = useState([]);
  const [loadingSightings, setLoadingSightings] = useState(false);
  const [mapForReportId, setMapForReportId] = useState(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [publicResult, myResult] = await Promise.all([
        api.get('/public/reportes', { params: { estado, tipo, q: query } }),
        api.get('/user/reportes')
      ]);
      setPublicRows(publicResult.data); setMineRows(myResult.data);
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar los avisos.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [estado, tipo]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [query]);

  const rows = useMemo(() => {
    if (!mine) return publicRows;
    return mineRows.filter((r) => (estado ? r.estado === estado : true) && (!tipo || r.tipo === tipo) && `${r.mascota || ''} ${r.ubicacion || ''} ${r.descripcion || ''}`.toLowerCase().includes(query.toLowerCase()));
  }, [mine, publicRows, mineRows, estado, tipo, query]);

  async function contact(report) {
    setBusyId(report.id); setError('');
    try {
      const { data } = await api.post('/user/conversaciones', { reporte_id: report.id });
      navigate(`/usuario/chat/${data.conversacion_id}`);
    } catch (e) { setError(e.response?.data?.message || 'No se pudo iniciar el contacto.'); }
    finally { setBusyId(null); }
  }

  async function toggleSightings(report) {
    if (sightingsForReportId === report.id) { setSightingsForReportId(null); setSightingRows([]); return; }
    setSightingsForReportId(report.id); setSightingRows([]); setLoadingSightings(true); setError('');
    try {
      const { data } = await api.get(`/user/reportes/${report.id}/avistamientos`);
      setSightingRows(data);
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar los avistamientos.');
      setSightingsForReportId(null);
    } finally { setLoadingSightings(false); }
  }

  function contactSighter(sighting) {
    navigate(`/usuario/chat?avistamiento_id=${encodeURIComponent(sighting.id)}`);
  }

  function startSighting(report) {
    setSightingForId(sightingForId === report.id ? null : report.id);
    setSightingForm({ ubicacion: '', descripcion: '', latitud: '', longitud: '', foto: '' });
    setSightingPhotoPreview('');
    setError('');
  }

  function setCurrentSightingLocation() {
    setError('');
    if (!navigator.geolocation) { setError('Este navegador no permite obtener ubicación.'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setSightingForm((current) => ({ ...current, latitud: coords.latitude.toFixed(7), longitud: coords.longitude.toFixed(7) })),
      () => setError('No se pudo obtener la ubicación. Revisa los permisos del navegador.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  async function uploadSightingPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setUploadingSightingPhoto(true);
    try {
      const optimized = await prepareImageForUpload(file);
      const { data } = await api.post('/user/uploads/imagen', optimized);
      setSightingForm((current) => ({ ...current, foto: data.url }));
      setSightingPhotoPreview(data.url);
      setMessage('Fotografía del avistamiento guardada.');
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'No se pudo cargar la fotografía del avistamiento.');
    } finally {
      setUploadingSightingPhoto(false);
    }
  }

  async function submitSighting(event, report) {
    event.preventDefault();
    setSendingSighting(true); setError(''); setMessage('');
    try {
      const { data } = await api.post(`/user/reportes/${report.id}/avistamientos`, {
        ubicacion: sightingForm.ubicacion,
        descripcion: sightingForm.descripcion,
        latitud: sightingForm.latitud || null,
        longitud: sightingForm.longitud || null,
        foto: sightingForm.foto || null
      });
      setMessage(data.message || 'Avistamiento enviado al propietario.');
      setSightingForId(null);
      setSightingForm({ ubicacion: '', descripcion: '', latitud: '', longitud: '', foto: '' });
      setSightingPhotoPreview('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo enviar el avistamiento.');
    } finally { setSendingSighting(false); }
  }

  async function resolve(report) {
    const prompt = report.tipo === 'PERDIDA'
      ? `¿Confirmas que encontraste a ${report.mascota || 'tu mascota'}? El aviso se resolverá y su estado volverá a EN CASA.`
      : `¿Confirmas que deseas resolver el reporte de ${report.mascota || 'esta mascota'}?`;
    if (!window.confirm(prompt)) return;
    setBusyId(report.id); setError('');
    try {
      const { data } = await api.patch(`/user/reportes/${report.id}/estado`, { estado: 'RESUELTO' });
      setMessage(data.message); setResolvedForShare(report); await load();
    } catch (e) { setError(e.response?.data?.message || 'No se pudo resolver el reporte.'); }
    finally { setBusyId(null); }
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
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        setMessage('Texto del reencuentro copiado para compartir.');
      } else {
        setError('Este navegador no permite compartir ni copiar automáticamente el mensaje.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError('No se pudo compartir el reencuentro.');
    }
  }

  return <div>
    <div className="page-header"><div><h1>Avisos y reportes</h1><p>Encuentra avisos de mascotas perdidas y encontradas, o gestiona tus propios casos.</p></div><button className="primary-button" onClick={() => navigate('/usuario/reportar')}><PlusCircle size={16}/>Crear aviso</button></div>
    {message && <div className="alert success">{message}</div>}{error && <div className="alert error">{error}</div>}{resolvedForShare && <div className="resolved-share panel"><div><strong>¡Caso actualizado!</strong><span>También puedes compartir un mensaje de agradecimiento a la comunidad.</span></div><button className="secondary-button compact" onClick={shareResolvedCase}><Share2 size={15}/>Compartir historia</button><button className="link-button" onClick={() => setResolvedForShare(null)}>Cerrar</button></div>}
    <div className="report-toolbar panel">
      <div className="report-search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por mascota, zona o descripción"/></div>
      <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="ACTIVO">Activos</option><option value="RESUELTO">Resueltos</option><option value="CERRADO">Cerrados</option></select>
      <select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Pérdida y hallazgo</option><option value="PERDIDA">Perdidas</option><option value="ENCONTRADA">Encontradas</option></select>
      <div className="report-view-toggle"><button className={!mine ? 'selected' : ''} onClick={() => setMine(false)}>Comunidad</button><button className={mine ? 'selected' : ''} onClick={() => setMine(true)}>Mis reportes</button></div>
    </div>
    {loading ? <div className="loading">Cargando avisos…</div> : rows.length === 0 ? <div className="empty-state panel"><PawPrint size={34}/><p>No hay avisos que coincidan con los filtros.</p><button className="secondary-button" onClick={() => navigate('/usuario/reportar')}>Publicar un aviso</button></div> : <div className="report-feed">{rows.map((report) => {
      const isMine = mineRows.some((ownedReport) => Number(ownedReport.id) === Number(report.id));
      const image = report.foto_mascota || report.foto;
      return <article className="community-report-card panel" key={report.id}>
        <div className="community-report-image">{image ? <img src={mediaUrl(image)} alt={`Foto de ${report.mascota || 'mascota'}`}/> : <PawPrint size={34}/>}</div>
        <div className="community-report-main"><div className="community-report-top"><span className={`report-type-pill ${report.tipo === 'PERDIDA' ? 'lost' : 'found'}`}>{report.tipo === 'PERDIDA' ? 'MASCOTA PERDIDA' : 'MASCOTA ENCONTRADA'}</span><span className={`simple-state ${report.estado.toLowerCase()}`}>{report.estado}</span></div>
          <h2>{report.mascota || 'Mascota sin identificar'}</h2><p className="community-report-meta">{report.especie || 'Especie no especificada'}{report.raza ? ` · ${report.raza}` : ''}{report.edad != null ? ` · ${report.edad} años` : ''}</p>
          <p className="community-report-description">{report.descripcion || 'No se agregó una descripción.'}</p>
          <div className="community-report-location"><MapPin size={15}/><span>{report.ubicacion || 'Ubicación no especificada'}</span>{report.latitud != null && report.longitud != null && <button type="button" className="link-button" onClick={() => setMapForReportId(mapForReportId === report.id ? null : report.id)}>{mapForReportId === report.id ? 'Ocultar mapa' : 'Ver mapa'}</button>}</div>
          {mapForReportId === report.id && report.latitud != null && report.longitud != null && <div className="community-report-map"><iframe title={`Mapa de ${report.mascota || 'la mascota'}`} loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent([Number(report.longitud)-0.01,Number(report.latitud)-0.01,Number(report.longitud)+0.01,Number(report.latitud)+0.01].join(','))}&layer=mapnik&marker=${Number(report.latitud)},${Number(report.longitud)}`}/><a href={`https://www.openstreetmap.org/?mlat=${report.latitud}&mlon=${report.longitud}#map=16/${report.latitud}/${report.longitud}`} target="_blank" rel="noreferrer">Abrir mapa completo</a></div>}
          <small>Publicado: {formatDate(report.fecha_reporte || report.created_at)}</small>
          <div className="community-report-actions">{report.estado === 'ACTIVO' && !isMine && <button className="primary-button compact" disabled={busyId === report.id} onClick={() => contact(report)}><MessageCircle size={15}/>{busyId === report.id ? 'Abriendo…' : 'Contactar'}</button>}{report.estado === 'ACTIVO' && report.tipo === 'PERDIDA' && !isMine && <button className="secondary-button compact" type="button" onClick={() => startSighting(report)}><MapPin size={15}/>Reportar avistamiento</button>}{mine && isMine && report.tipo === 'PERDIDA' && <button className="secondary-button compact" type="button" onClick={() => toggleSightings(report)}><MapPin size={15}/>{sightingsForReportId === report.id ? 'Ocultar avistamientos' : 'Ver avistamientos'}</button>}{mine && isMine && report.estado === 'ACTIVO' && <button className="secondary-button compact" disabled={busyId === report.id} onClick={() => resolve(report)}><CheckCircle size={15}/>{report.tipo === 'PERDIDA' ? '¡Ya la encontré!' : 'Marcar como resuelto'}</button>}</div>
          {mine && isMine && sightingsForReportId === report.id && <div className="sighting-results"><strong>Avistamientos de {report.mascota || 'tu mascota'}</strong>{loadingSightings ? <span className="muted">Cargando avistamientos…</span> : sightingRows.length === 0 ? <span className="muted">Todavía no se han reportado avistamientos.</span> : sightingRows.map((sighting) => <div className="sighting-result" key={sighting.id}><div><strong>{sighting.avistador || 'Usuario de Huellitas'}</strong><span>{sighting.ubicacion}</span>{sighting.descripcion && <p>{sighting.descripcion}</p>}{sighting.foto && <img className="sighting-photo-thumb" src={mediaUrl(sighting.foto)} alt="Fotografía del avistamiento"/>}<small>{formatDate(sighting.created_at)}</small>{sighting.latitud != null && sighting.longitud != null && <a href={`https://www.google.com/maps?q=${sighting.latitud},${sighting.longitud}`} target="_blank" rel="noreferrer">Ver ubicación</a>}</div><button className="primary-button compact" type="button" onClick={() => contactSighter(sighting)}><MessageCircle size={14}/>Contactar</button></div>)}</div>}
          {sightingForId === report.id && <form className="sighting-form" onSubmit={(event) => submitSighting(event, report)}><strong>¿Dónde viste a {report.mascota || 'esta mascota'}?</strong><label>Ubicación o referencia<input required maxLength={255} value={sightingForm.ubicacion} onChange={(event) => setSightingForm((current) => ({ ...current, ubicacion: event.target.value }))} placeholder="Barrio, calle, plaza o referencia"/></label><label>Descripción adicional<textarea rows="2" maxLength={2000} value={sightingForm.descripcion} onChange={(event) => setSightingForm((current) => ({ ...current, descripcion: event.target.value }))} placeholder="Hora aproximada, hacia dónde iba, estado de la mascota…"/></label><div className="coordinate-row"><label>Latitud<input inputMode="decimal" value={sightingForm.latitud} onChange={(event) => setSightingForm((current) => ({ ...current, latitud: event.target.value }))} placeholder="Opcional"/></label><label>Longitud<input inputMode="decimal" value={sightingForm.longitud} onChange={(event) => setSightingForm((current) => ({ ...current, longitud: event.target.value }))} placeholder="Opcional"/></label><button type="button" className="secondary-button" onClick={setCurrentSightingLocation}><LocateFixed size={15}/>Mi ubicación</button></div><label className="sighting-photo-uploader">{uploadingSightingPhoto ? 'Subiendo fotografía…' : 'Adjuntar foto del avistamiento (opcional)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadSightingPhoto} disabled={uploadingSightingPhoto}/></label>{sightingPhotoPreview && <div className="report-photo-preview"><img src={mediaUrl(sightingPhotoPreview)} alt="Fotografía del avistamiento"/><span>Fotografía adjunta</span></div>}<div className="community-report-actions"><button className="primary-button compact" type="submit" disabled={sendingSighting || uploadingSightingPhoto || !sightingForm.ubicacion.trim()}><Send size={15}/>{sendingSighting ? 'Enviando…' : 'Enviar al propietario'}</button><button type="button" className="secondary-button compact" onClick={() => setSightingForId(null)}>Cancelar</button></div></form>}
        </div>
      </article>;
    })}</div>}
  </div>;
}
