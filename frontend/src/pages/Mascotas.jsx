import { useEffect, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

export default function Mascotas() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try { const { data } = await api.get('/admin/mascotas', { params: { search, estado } }); setRows(data); setError(''); }
    catch (e) { setError(e.response?.data?.message || 'No se pudieron cargar las mascotas.'); }
  }
  useEffect(() => { load(); }, [estado]);

  async function view(id) {
    try { const { data } = await api.get(`/admin/mascotas/${id}`); setSelected(data); }
    catch (e) { setError(e.response?.data?.message || 'No se pudo cargar la mascota.'); }
  }

  return <div>
    <div className="page-header"><div><h1>Base de mascotas</h1><p>Consulta las mascotas registradas y su relación con cada propietario.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="toolbar">
      <div className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Buscar mascota, raza, propietario o CI..." /></div>
      <select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="EN_CASA">En casa</option><option value="PERDIDA">Perdidas</option><option value="ENCONTRADA">Encontradas</option></select>
      <button className="secondary-button" type="button" onClick={load}>Buscar</button>
    </div>
    <div className="panel">
      <div className="table-wrap"><table>
        <thead><tr><th>Mascota</th><th>Especie / raza</th><th>Propietario</th><th>Vacunado</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{rows.map((m) => <tr key={m.id}>
          <td><div className="pet-cell"><div className="pet-avatar">🐾</div><div><strong>{m.nombre}</strong><span>{m.sexo ? m.sexo.toLowerCase() : 'Sin sexo'} · {m.edad ?? '—'} años</span></div></div></td>
          <td>{m.especie}<br /><span className="muted">{m.raza || 'Sin raza'}</span></td>
          <td><strong>{m.propietario}</strong><span className="muted">{m.ci}</span></td>
          <td><StatusBadge value={m.vacunado} /></td><td><StatusBadge value={m.estado} /></td>
          <td><button className="icon-button" type="button" onClick={() => view(m.id)} title="Ver detalle"><Eye size={17} /></button></td>
        </tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <div className="empty-state">No hay mascotas que coincidan con el filtro.</div>}
    </div>

    <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalle de mascota" wide>
      {selected && <div className="pet-detail">
        <div className="pet-detail-head"><div className="pet-avatar big">🐶</div><div><h2>{selected.nombre}</h2><p>{selected.especie} · {selected.raza || 'Sin raza'}</p><StatusBadge value={selected.estado} /></div></div>
        <div className="detail-grid">
          <div><span className="detail-label">Sexo</span><strong>{selected.sexo || '—'}</strong></div>
          <div><span className="detail-label">Edad</span><strong>{selected.edad ?? '—'} años</strong></div>
          <div><span className="detail-label">Vacunado</span><StatusBadge value={selected.vacunado} /></div>
          <div><span className="detail-label">Propietario</span><strong>{selected.propietario}</strong></div>
          <div><span className="detail-label">CI</span><strong>{selected.ci}</strong></div>
          <div><span className="detail-label">Teléfono</span><strong>{selected.telefono || '—'}</strong></div>
          <div className="full-span"><span className="detail-label">Características</span><p className="detail-text">{selected.caracteristicas || 'Sin características registradas.'}</p></div>
          <div className="full-span"><span className="detail-label">Identificaciones QR</span>{selected.qrs?.length ? <div className="mini-list">{selected.qrs.map((q) => <div className="list-row" key={q.id}><span>{q.codigo}</span><StatusBadge value={q.estado} /></div>)}</div> : <span className="muted">No tiene solicitudes QR.</span>}</div>
        </div>
      </div>}
    </Modal>
  </div>;
}
