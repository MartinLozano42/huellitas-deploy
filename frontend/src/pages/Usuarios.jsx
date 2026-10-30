import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Eye, Search, X, Ban } from 'lucide-react';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

export default function Usuarios() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [estado, setEstado] = useState(searchParams.get('estado') || '');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try { const { data } = await api.get('/admin/usuarios', { params: { search, estado } }); setRows(data); setError(''); }
    catch (e) { setError(e.response?.data?.message || 'No se pudieron cargar los usuarios.'); }
  }
  useEffect(() => { load(); }, [estado]);

  async function updateStatus(id, next) {
    try { await api.patch(`/admin/usuarios/${id}/estado`, { estado: next }); await load(); setSelected(null); window.dispatchEvent(new Event('huellitas:solicitudes-updated')); }
    catch (e) { setError(e.response?.data?.message || 'No se pudo actualizar el usuario.'); }
  }

  async function viewUser(id) {
    const { data } = await api.get(`/admin/usuarios/${id}`);
    setSelected(data);
  }

  return (
    <div>
      <PageHeader title="Gestión de usuarios" subtitle="Revisa y administra las cuentas registradas en Huellitas." />
      {error && <div className="alert error">{error}</div>}
      <div className="toolbar">
        <div className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Buscar por nombre, correo o CI..." /></div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="PENDIENTE">Pendientes</option><option value="APROBADO">Aprobados</option><option value="RECHAZADO">Rechazados</option><option value="SUSPENDIDO">Suspendidos</option></select>
        <button className="secondary-button" type="button" onClick={load}>Buscar</button>
      </div>

      <div className="panel">
        <div className="table-wrap"><table>
          <thead><tr><th>Usuario</th><th>CI</th><th>Teléfono</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead>
          <tbody>{rows.map((u) => <tr key={u.id}>
            <td><div className="person"><div className="avatar small">{u.nombre.slice(0,1).toUpperCase()}</div><div><strong>{u.nombre} {u.apellido}</strong><span>{u.email}</span></div></div></td>
            <td>{u.ci}</td><td>{u.telefono || '—'}</td><td><StatusBadge value={u.estado} /></td><td>{new Date(u.created_at).toLocaleDateString('es-BO')}</td>
            <td><div className="action-row">
              <button className="icon-button" type="button" onClick={() => viewUser(u.id)} title="Ver detalle"><Eye size={17} /></button>
              {u.estado === 'PENDIENTE' && <><button className="icon-button success" type="button" onClick={() => updateStatus(u.id, 'APROBADO')} title="Aprobar"><Check size={17} /></button><button className="icon-button danger" type="button" onClick={() => updateStatus(u.id, 'RECHAZADO')} title="Rechazar"><X size={17} /></button></>}
              {u.estado === 'APROBADO' && <button className="icon-button danger" type="button" onClick={() => updateStatus(u.id, 'SUSPENDIDO')} title="Suspender"><Ban size={17} /></button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {rows.length === 0 && <Empty text="No hay usuarios que coincidan con el filtro." />}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Ficha de usuario" wide>
        {selected && <div className="detail-grid">
          <div><span className="detail-label">Nombre completo</span><strong>{selected.nombre} {selected.apellido}</strong></div>
          <div><span className="detail-label">CI</span><strong>{selected.ci}</strong></div>
          <div><span className="detail-label">Correo</span><strong>{selected.email}</strong></div>
          <div><span className="detail-label">Teléfono</span><strong>{selected.telefono || '—'}</strong></div>
          <div><span className="detail-label">Estado</span><StatusBadge value={selected.estado} /></div>
          <div><span className="detail-label">Mascotas</span><strong>{selected.mascotas?.length || 0}</strong></div>
          <div className="full-span"><span className="detail-label">Mascotas registradas</span>{selected.mascotas?.length ? <div className="mini-pets">{selected.mascotas.map((m) => <div className="mini-pet" key={m.id}><strong>{m.nombre}</strong><span>{m.especie} · {m.raza || 'Sin raza'} · <StatusBadge value={m.estado} /></span></div>)}</div> : <span className="muted">Este usuario todavía no tiene mascotas.</span>}</div>
          {selected.estado === 'PENDIENTE' && <div className="modal-actions full-span"><button className="primary-button" onClick={() => updateStatus(selected.id, 'APROBADO')}><Check size={17} />Aprobar usuario</button><button className="danger-button" onClick={() => updateStatus(selected.id, 'RECHAZADO')}><X size={17} />Rechazar usuario</button></div>}
        </div>}
      </Modal>
    </div>
  );
}

function PageHeader({ title, subtitle }) { return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div></div>; }
function Empty({ text }) { return <div className="empty-state">{text}</div>; }
