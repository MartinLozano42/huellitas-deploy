import { useEffect, useState } from 'react';
import { PlusCircle, QrCode, PawPrint, Image as ImageIcon, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function UserMascotas() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { data } = await api.get('/user/mascotas');
      setRows(data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar tus mascotas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function requestQr(id) {
    setMessage('');
    setError('');
    try {
      const { data } = await api.post(`/user/mascotas/${id}/qr`);
      setMessage(data.message);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo solicitar el QR.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Mis mascotas</h1><p>Registra tus mascotas y gestiona sus identificaciones.</p></div>
        <button className="primary-button" onClick={() => navigate('/usuario/mascotas/nueva')}><PlusCircle size={17} />Registrar mascota</button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {loading ? <div className="loading">Cargando mascotas...</div> : rows.length === 0 ? (
        <div className="empty-state"><PawPrint size={32} /><p>Aún no registraste mascotas.</p><button className="secondary-button" onClick={() => navigate('/usuario/mascotas/nueva')}>Registrar la primera</button></div>
      ) : (
        <div className="user-pet-grid">
          {rows.map((m) => (
            <div className="user-pet-card" key={m.id}>
              <div className="user-pet-avatar">{m.foto ? <img src={mediaUrl(m.foto)} alt={m.nombre} /> : <PawPrint size={24} />}</div>
              <div className="user-pet-main">
                <div className="user-pet-title"><div><h2>{m.nombre}</h2><p>{m.especie} · {m.raza || 'Sin raza'}</p></div><StatusBadge value={m.estado} /></div>
                <div className="user-pet-meta"><span>Sexo: {m.sexo || '—'}</span><span>Edad: {m.edad} años</span><span>Vacunado: {m.vacunado}</span></div>
                <div className="user-pet-actions">
                  <button className="secondary-button compact" onClick={() => navigate(`/usuario/mascotas/${m.id}`)}>Ver detalle</button>
                  <button className="secondary-button compact" onClick={() => navigate(`/usuario/mascotas/${m.id}/editar`)}><Pencil size={14}/>Editar</button>
                  <button className="secondary-button compact" onClick={() => navigate(`/usuario/afiches?mascota=${m.id}`)}><ImageIcon size={14}/>Crear afiche</button>
                  <button className="primary-button compact" onClick={() => requestQr(m.id)}><QrCode size={15} />Solicitar QR</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
