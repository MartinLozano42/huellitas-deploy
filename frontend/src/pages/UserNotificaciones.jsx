import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, MapPin, MessageCircle, PawPrint, Save } from 'lucide-react';
import api from '../api.js';

export default function UserNotificaciones() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('10');
  const [alertsActive, setAlertsActive] = useState(false);

  async function load() {
    try { const { data } = await api.get('/user/notificaciones'); setItems(data.items || []); setUnread(Number(data.no_leidas || 0)); setError(''); }
    catch (e) { setError(e.response?.data?.message || 'No se pudieron cargar las notificaciones.'); }
    finally { setLoading(false); }
  }
  async function loadPreferences() {
    try {
      const { data } = await api.get('/user/preferencias-alertas');
      setLatitude(data.latitud == null ? '' : String(data.latitud));
      setLongitude(data.longitud == null ? '' : String(data.longitud));
      setRadius(String(data.radio_km || 10)); setAlertsActive(Boolean(data.activo));
    } catch (e) { setError(e.response?.data?.message || 'No se pudieron cargar las alertas cercanas.'); }
    finally { setPrefsLoading(false); }
  }
  useEffect(() => { load(); loadPreferences(); const id = window.setInterval(load, 20000); return () => window.clearInterval(id); }, []);

  function getCurrentLocation() {
    setError('');
    if (!navigator.geolocation) { setError('Este navegador no permite obtener la ubicación.'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLatitude(coords.latitude.toFixed(7)); setLongitude(coords.longitude.toFixed(7)); setPrefsMessage('Ubicación obtenida. Guarda las preferencias para activar las alertas.'); },
      () => setError('No se pudo obtener la ubicación. Revisa los permisos del navegador.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  async function savePreferences(event) {
    event.preventDefault(); setSavingPrefs(true); setPrefsMessage(''); setError('');
    try {
      const { data } = await api.put('/user/preferencias-alertas', {
        latitud: latitude || null, longitud: longitude || null, radio_km: Number(radius), activo: alertsActive
      });
      setPrefsMessage(data.message); setAlertsActive(Boolean(data.activo));
    } catch (e) { setError(e.response?.data?.message || 'No se pudieron guardar las preferencias.'); }
    finally { setSavingPrefs(false); }
  }

  async function markRead(id) {
    try { await api.patch(`/user/notificaciones/${id}/leida`); setItems((current) => current.map((item) => item.id === id ? { ...item, leida: 1 } : item)); setUnread((n) => Math.max(0, n - 1)); }
    catch (e) { setError(e.response?.data?.message || 'No se pudo actualizar la notificación.'); }
  }

  function openNotification(item) {
    const type = String(item.tipo || '').toUpperCase();
    if (type.includes('CHAT')) navigate('/usuario/chat');
    else if (type.includes('REPORTE') || type.includes('MASCOTA_ENCONTRADA')) navigate('/usuario/reportes');
    else navigate('/usuario/reportes');
    if (!item.leida) markRead(item.id);
  }

  async function markAll() {
    try { await api.patch('/user/notificaciones/leidas/todas'); setItems((current) => current.map((item) => ({ ...item, leida: 1 }))); setUnread(0); }
    catch (e) { setError(e.response?.data?.message || 'No se pudieron actualizar las notificaciones.'); }
  }

  return <div>
    <div className="page-header"><div><h1>Notificaciones</h1><p>Mensajes y avisos importantes de Huellitas.</p></div>{unread > 0 && <button className="secondary-button" onClick={markAll}><CheckCheck size={16}/>Marcar todas como leídas</button>}</div>
    {error && <div className="alert error">{error}</div>}
    <div className="notification-page-summary panel"><Bell size={22}/><div><strong>{unread} sin leer</strong><span>Los avisos se actualizan automáticamente cada 20 segundos.</span></div></div>
    <section className="panel alert-preferences-panel"><div className="alert-preferences-title"><MapPin size={20}/><div><h2>Alertas de mascotas cercanas</h2><p>Guarda una zona y recibe avisos de pérdida o hallazgo dentro del radio seleccionado. El resto de los reportes continúa visible en la comunidad.</p></div></div>
      {prefsMessage && <div className="alert success">{prefsMessage}</div>}
      {prefsLoading ? <div className="loading">Cargando preferencias…</div> : <form className="form-grid" onSubmit={savePreferences}>
        <label>Latitud<input inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-17.3935" /></label>
        <label>Longitud<input inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-66.1570" /></label>
        <label>Radio de notificación<select value={radius} onChange={(e) => setRadius(e.target.value)}><option value="1">1 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label>
        <label className="alert-toggle-label"><input type="checkbox" checked={alertsActive} onChange={(e) => setAlertsActive(e.target.checked)} /> Activar alertas cercanas</label>
        <div className="full-span alert-preference-actions"><button type="button" className="secondary-button" onClick={getCurrentLocation}><MapPin size={15}/>Usar mi ubicación actual</button><button type="submit" className="primary-button" disabled={savingPrefs}><Save size={15}/>{savingPrefs ? 'Guardando…' : 'Guardar preferencias'}</button></div>
      </form>}
    </section>
    {loading ? <div className="loading">Cargando notificaciones…</div> : items.length === 0 ? <div className="empty-state panel"><Bell size={34}/><p>Aún no tienes notificaciones.</p></div> : <div className="notification-page-list">{items.map((item) => <article className={`notification-page-item panel ${item.leida ? '' : 'unread'}`} key={item.id}><div className="notification-page-icon">{String(item.tipo).includes('CHAT') ? <MessageCircle size={19}/> : <PawPrint size={19}/>}</div><div className="notification-page-copy"><strong>{item.titulo}</strong><p>{item.mensaje}</p><small>{new Date(item.fecha).toLocaleString('es-BO')}</small></div><div className="notification-page-actions"><button className="link-button" type="button" onClick={() => openNotification(item)}>Abrir</button>{!item.leida && <button className="link-button" type="button" onClick={() => markRead(item.id)}>Marcar leída</button>}</div></article>)}</div>}
  </div>;
}
