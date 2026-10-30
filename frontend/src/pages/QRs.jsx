import { useEffect, useMemo, useState } from 'react';
import { Check, Download, MapPin, QrCode, Search, X, CheckCircle2 } from 'lucide-react';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function QRs() {
  const [rows, setRows] = useState([]);
  const [view, setView] = useState('todos');
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState(null);
  const [processingPickup, setProcessingPickup] = useState(null);

  async function load() {
    try {
      const { data } = await api.get('/admin/qr');
      setRows(data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar los QR.');
    }
  }
  useEffect(() => { load(); }, []);

  const pendingQrCount = rows.filter((q) => q.estado === 'PENDIENTE').length;
  const pendingPickupCount = rows.filter((q) => q.pickup_sucursal && q.pickup_estado === 'PENDIENTE').length;

  const visibleRows = useMemo(() => {
    if (view === 'pendientes') return rows.filter((q) => q.estado === 'PENDIENTE');
    if (view === 'retiros') return rows.filter((q) => Boolean(q.pickup_sucursal));
    if (estado) return rows.filter((q) => q.estado === estado);
    return rows;
  }, [rows, view, estado]);

  async function update(id, next) {
    setError(''); setMessage('');
    try {
      const { data } = await api.patch(`/admin/qr/${id}/estado`, { estado: next });
      setMessage(`${data.message}${data.codigo ? ` Código: ${data.codigo}` : ''}`);
      await load();
      window.dispatchEvent(new Event('huellitas:solicitudes-updated'));
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo actualizar el QR.');
    }
  }

  async function downloadQr(q) {
    setDownloading(q.id); setError('');
    try {
      const { data } = await api.get(`/admin/qr/${q.id}/imagen`);
      const link = document.createElement('a');
      link.href = data.qrDataUrl;
      link.download = `Huellitas-${String(q.mascota).replace(/[^a-z0-9-_]/gi, '-')}-${q.codigo}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setMessage(`QR de ${q.mascota} descargado.`);
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo descargar el QR.');
    } finally {
      setDownloading(null);
    }
  }

  async function markPickupAttended(q) {
    setProcessingPickup(q.id); setError(''); setMessage('');
    try {
      const { data } = await api.patch(`/admin/qr/${q.id}/recogida-estado`, { estado: 'ATENDIDO' });
      setMessage(`${data.message} ${q.mascota} · ${q.pickup_sucursal}.`);
      await load();
      window.dispatchEvent(new Event('huellitas:solicitudes-updated'));
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo actualizar la solicitud de retiro.');
    } finally {
      setProcessingPickup(null);
    }
  }

  return <div>
    <div className="page-header">
      <div><h1>Identificaciones QR</h1><p>Administra solicitudes, descarga códigos y atiende por separado los retiros en sucursal.</p></div>
    </div>
    {message && <div className="alert success">{message}</div>}
    {error && <div className="alert error">{error}</div>}

    <div className="case-tabs qr-queue-tabs" role="tablist" aria-label="Colas de solicitudes QR">
      <button className={`case-tab ${view === 'todos' ? 'active' : ''}`} type="button" onClick={() => setView('todos')}>Todos <span className="tab-count neutral">{rows.length}</span></button>
      <button className={`case-tab ${view === 'pendientes' ? 'active' : ''}`} type="button" onClick={() => { setView('pendientes'); setEstado(''); }}>Por aprobar <span className={`tab-count ${pendingQrCount ? 'urgent' : ''}`}>{pendingQrCount}</span></button>
      <button className={`case-tab ${view === 'retiros' ? 'active' : ''}`} type="button" onClick={() => { setView('retiros'); setEstado(''); }}>Retiros en sucursal <span className={`tab-count ${pendingPickupCount ? 'urgent' : ''}`}>{pendingPickupCount}</span></button>
    </div>

    {view === 'todos' && <div className="toolbar"><div className="search-box"><Search size={18} /><span className="muted">Filtrar por estado</span></div><select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="PENDIENTE">Pendientes</option><option value="APROBADO">Aprobados</option><option value="ACTIVO">Activos</option><option value="RECHAZADO">Rechazados</option><option value="DESACTIVADO">Desactivados</option></select><button className="secondary-button" type="button" onClick={load}>Actualizar</button></div>}

    <div className="panel"><div className="table-wrap"><table>
      <thead><tr><th>QR</th><th>Mascota</th><th>Propietario</th><th>Solicitud</th><th>Retiro en sucursal</th><th>Estado QR</th><th>Acciones</th></tr></thead>
      <tbody>{visibleRows.map((q) => <tr key={q.id}>
        <td><div className="qr-cell"><div className="qr-placeholder"><QrCode size={26} /></div><div><strong>{q.codigo || 'Pendiente de generar'}</strong><span>ID #{q.id}</span></div></div></td>
        <td><strong>{q.mascota}</strong><span className="muted">{q.especie}</span></td>
        <td>{q.propietario}<span className="muted">CI {q.ci}</span></td>
        <td>{q.solicitado_at ? new Date(q.solicitado_at).toLocaleDateString('es-BO') : '—'}</td>
        <td>{q.pickup_sucursal ? <div className="qr-pickup-admin"><MapPin size={15}/><div><strong>{q.pickup_sucursal}</strong><span>{q.pickup_solicitado_at ? new Date(q.pickup_solicitado_at).toLocaleString('es-BO') : 'Solicitud registrada'}</span><StatusBadge value={q.pickup_estado || 'PENDIENTE'} /></div></div> : <span className="muted">No solicitado</span>}</td>
        <td><StatusBadge value={q.estado} /></td>
        <td><div className="action-row">
          {q.estado === 'PENDIENTE' && <><button className="icon-button success" type="button" onClick={() => update(q.id, 'APROBADO')} title="Aprobar"><Check size={17}/></button><button className="icon-button danger" type="button" onClick={() => update(q.id, 'RECHAZADO')} title="Rechazar"><X size={17}/></button></>}
          {q.estado === 'APROBADO' && <button className="secondary-button compact" type="button" onClick={() => update(q.id, 'ACTIVO')}>Activar</button>}
          {['APROBADO','ACTIVO'].includes(q.estado) && <button className="icon-button" type="button" onClick={() => downloadQr(q)} disabled={downloading === q.id} title="Descargar QR" aria-label={`Descargar QR de ${q.mascota}`}>{downloading === q.id ? '…' : <Download size={17}/>}</button>}
          {q.estado === 'ACTIVO' && <button className="icon-button danger" type="button" onClick={() => update(q.id, 'DESACTIVADO')} title="Desactivar"><X size={17}/></button>}
          {q.pickup_sucursal && q.pickup_estado !== 'ATENDIDO' && <button className="secondary-button compact pickup-attend-button" type="button" onClick={() => markPickupAttended(q)} disabled={processingPickup === q.id} title="Marcar la solicitud de retiro como atendida">{processingPickup === q.id ? 'Guardando…' : <><CheckCircle2 size={14}/> Atendido</>}</button>}
        </div></td>
      </tr>)}</tbody>
    </table></div>{visibleRows.length === 0 && <div className="empty-state">{view === 'pendientes' ? 'No hay solicitudes QR pendientes de aprobación.' : view === 'retiros' ? 'No hay solicitudes de retiro en sucursal.' : 'No hay identificaciones QR con este filtro.'}</div>}</div>
  </div>;
}
