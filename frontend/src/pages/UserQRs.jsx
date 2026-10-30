import { useEffect, useState } from 'react';
import { Check, Download, MapPin, QrCode } from 'lucide-react';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

const SUCURSALES = ['Sucursal Central', 'Sucursal Norte', 'Sucursal Sur'];

export default function UserQRs() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pickup, setPickup] = useState(null);
  const [branch, setBranch] = useState('');
  const [qrImages, setQrImages] = useState({});
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/user/qr');
      setRows(data);
      const approved = data.filter((q) => ['APROBADO', 'ACTIVO'].includes(q.estado));
      const entries = await Promise.all(approved.map(async (q) => {
        try {
          const { data: imageData } = await api.get(`/user/qr/${q.id}/imagen`);
          return [q.id, imageData.qrDataUrl];
        } catch { return [q.id, null]; }
      }));
      setQrImages(Object.fromEntries(entries));
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar tus QR.');
    }
  }

  useEffect(() => { load(); }, []);

  function downloadQr(q) {
    const qrImage = qrImages[q.id];
    if (!qrImage) return setError('No se pudo preparar la imagen del QR.');
    const link = document.createElement('a');
    link.href = qrImage;
    link.download = `Huellitas-${String(q.mascota).replace(/[^a-z0-9-_]/gi, '-')}-${q.codigo}.png`;
    document.body.appendChild(link); link.click(); link.remove();
  }

  function openPickup(q) {
    setPickup(q);
    setBranch(q.pickup_sucursal || '');
    setMessage(''); setError('');
  }

  async function savePickup() {
    if (!pickup || !branch || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { data } = await api.patch(`/user/qr/${pickup.id}/recogida`, { sucursal: branch });
      setMessage(data.message || `Retiro solicitado en ${branch}.`);
      setPickup(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la sucursal de retiro.');
    } finally { setSaving(false); }
  }

  return <div>
    <div className="page-header"><div><div className="page-title-row"><QrCode size={24} /><h1>Mis QR</h1></div><p>Consulta, descarga o solicita el retiro físico de tus identificaciones aprobadas.</p></div></div>
    {message && <div className="alert success">{message}</div>}
    {error && <div className="alert error">{error}</div>}
    {rows.length === 0 ? <div className="empty-state"><QrCode size={32} /><p>Todavía no tienes solicitudes de QR.</p></div> :
      <div className="user-qr-grid">{rows.map((q) => {
        const ready = ['APROBADO', 'ACTIVO'].includes(q.estado) && !!qrImages[q.id];
        return <div className="user-qr-card" key={q.id}>
          <div className="user-qr-image-wrap">{ready ? <img src={qrImages[q.id]} alt={`QR de ${q.mascota}`} /> : <QrCode size={72} />}</div>
          <div className="user-qr-copy">
            <div className="user-pet-title"><div><h2>{q.mascota}</h2><p>{q.especie} · {q.raza || 'Sin raza'}</p></div><StatusBadge value={q.estado} /></div>
            <div className="user-qr-code">{q.codigo}</div>
            <span className="muted">Solicitado: {new Date(q.solicitado_at).toLocaleString('es-BO')}</span>
            {q.pickup_sucursal && <div className="qr-delivery-note"><MapPin size={16} /><span>Retiro solicitado: <strong>{q.pickup_sucursal}</strong>{q.pickup_solicitado_at ? ` · ${new Date(q.pickup_solicitado_at).toLocaleDateString('es-BO')}` : ''}</span><button className="link-button" type="button" onClick={() => openPickup(q)}>Cambiar</button></div>}
            {ready && <div className="user-qr-actions"><button className="primary-button compact" type="button" onClick={() => downloadQr(q)}><Download size={15} />Descargar QR</button><button className="secondary-button compact" type="button" onClick={() => openPickup(q)}><MapPin size={15} />Recoger en sucursal</button></div>}
          </div>
        </div>;
      })}</div>}
    <Modal open={Boolean(pickup)} title="Recoger QR en una sucursal" onClose={() => setPickup(null)}>
      <p className="detail-text" style={{ marginBottom: 14 }}>Elige dónde deseas retirar físicamente el QR de {pickup?.mascota}. Esta selección se notificará al Admin.</p>
      <div className="branch-list">{SUCURSALES.map((item) => <button key={item} type="button" className={`branch-option ${branch === item ? 'selected' : ''}`} onClick={() => setBranch(item)}><MapPin size={18} /><span>{item}</span>{branch === item && <Check size={17} />}</button>)}</div>
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setPickup(null)}>Cancelar</button><button className="primary-button" type="button" onClick={savePickup} disabled={!branch || saving}>{saving ? 'Guardando...' : <><Check size={16} />Confirmar retiro</>}</button></div>
    </Modal>
  </div>;
}
