import { useEffect, useState } from 'react';
import { Check, Clock3, Dog, FileWarning, QrCode, Users, X } from 'lucide-react';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const cards = [
  ['total_usuarios', 'Usuarios', Users, 'accent'],
  ['pendientes', 'Pendientes', Clock3, 'warning'],
  ['total_mascotas', 'Mascotas', Dog, 'blue'],
  ['perdidas', 'Perdidas', FileWarning, 'danger'],
  ['encontradas', 'Encontradas', Check, 'success'],
  ['qr_pendientes', 'QR pendientes', QrCode, 'purple'],
  ['reportes_activos', 'Reportes activos', FileWarning, 'orange'],
  ['reportes_resueltos', 'Casos resueltos', Check, 'green']
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/dashboard').then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message || 'No se pudo cargar el dashboard.'));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="loading">Cargando dashboard...</div>;

  const metrics = data.metrics;
  return (
    <div>
      <PageHeader title="Dashboard principal" subtitle="Vista general de la operación de Huellitas." />

      <section className="stats-grid">
        {cards.map(([key, label, Icon, tone]) => (
          <div className="stat-card" key={key}>
            <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
            <div><span>{label}</span><strong>{Number(metrics[key] || 0).toLocaleString('es-BO')}</strong></div>
          </div>
        ))}
      </section>

      <section className="two-col">
        <div className="panel">
          <div className="panel-header"><div><h2>Usuarios recientes</h2><p>Últimos registros del sistema.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Usuario</th><th>CI</th><th>Estado</th><th>Registro</th></tr></thead>
              <tbody>
                {data.recentUsers.map((u) => <tr key={u.id}>
                  <td><div className="person"><div className="avatar small">{u.nombre.slice(0,1).toUpperCase()}</div><div><strong>{u.nombre} {u.apellido}</strong><span>{u.email}</span></div></div></td>
                  <td>{u.ci}</td><td><StatusBadge value={u.estado} /></td><td>{new Date(u.created_at).toLocaleDateString('es-BO')}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel quick-panel">
          <div className="panel-header"><div><h2>Atención rápida</h2><p>Elementos que requieren revisión.</p></div></div>
          <div className="quick-item"><div><span>Usuarios pendientes</span><strong>{metrics.pendientes}</strong></div><a href="/usuarios?estado=PENDIENTE">Revisar</a></div>
          <div className="quick-item"><div><span>Solicitudes QR</span><strong>{metrics.qr_pendientes}</strong></div><a href="/qr?estado=PENDIENTE">Revisar</a></div>
          <div className="quick-item"><div><span>Reportes activos</span><strong>{metrics.reportes_activos}</strong></div><a href="/reportes?vista=casos&estado=ACTIVO">Ver casos</a></div>
        </div>
      </section>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
