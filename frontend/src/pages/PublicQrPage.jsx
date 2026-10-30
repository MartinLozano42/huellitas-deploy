import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle, MapPin, MessageCircle, PawPrint, ShieldCheck } from 'lucide-react';
import api, { mediaUrl } from '../api.js';

function readUser() {
  try { return JSON.parse(localStorage.getItem('prm_user') || '{}'); } catch { return {}; }
}

export default function PublicQrPage() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    api.get(`/public/qr/${encodeURIComponent(codigo)}`)
      .then(({ data: response }) => { if (active) setData(response); })
      .catch((e) => { if (active) setError(e.response?.data?.message || 'No se pudo consultar el código QR.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [codigo]);

  function continueTo(path) {
    const token = localStorage.getItem('prm_token');
    const user = readUser();
    if (token && user.rol === 'USER') navigate(path);
    else navigate('/login', { state: { from: path, notice: 'Inicia sesión para contactar al propietario o publicar un reporte.' } });
  }

  if (loading) return <main className="public-qr-shell"><div className="public-qr-card"><div className="loading">Consultando identificación…</div></div></main>;
  if (error || !data?.mascota) return <main className="public-qr-shell"><div className="public-qr-card"><div className="public-qr-brand"><PawPrint size={26}/><strong>HUELLITAS</strong></div><div className="alert error">{error || 'No se encontró una mascota asociada a este QR.'}</div><button className="secondary-button full" onClick={() => navigate('/')}><ArrowLeft size={16}/>Volver al inicio</button></div></main>;

  const pet = data.mascota;
  const isLost = pet.estado === 'PERDIDA';
  return <main className="public-qr-shell">
    <section className="public-qr-card">
      <div className="public-qr-brand"><PawPrint size={26}/><div><strong>HUELLITAS</strong><span>Identificación de mascota</span></div></div>
      <div className="public-qr-intro"><h1>{isLost ? 'Esta mascota está reportada como perdida' : '¿Encontraste una mascota?'}</h1><p>{isLost ? 'Consulta la ficha y ayuda a reunirla con su familia.' : 'Podemos ayudarte a contactar a su familia de forma segura.'}</p></div>
      <div className="public-qr-pet">
        <div className="public-qr-photo">{pet.foto ? <img src={mediaUrl(pet.foto)} alt={`Foto de ${pet.nombre}`}/> : <PawPrint size={44}/>}</div>
        <div><span className={`report-type-pill ${isLost ? 'lost' : 'found'}`}>{isLost ? 'REPORTE DE PÉRDIDA ACTIVO' : 'QR HUELLITAS ACTIVO'}</span><h2>{pet.nombre}</h2><p>{[pet.especie, pet.raza, pet.sexo, pet.edad != null ? `${pet.edad} años` : ''].filter(Boolean).join(' · ')}</p></div>
      </div>
      <div className="public-qr-info"><ShieldCheck size={18}/><p>Por privacidad, Huellitas no muestra públicamente el teléfono, correo ni domicilio del propietario. Usa el chat seguro para comunicarte.</p></div>
      {pet.caracteristicas && <div className="public-qr-description"><strong>Características</strong><p>{pet.caracteristicas}</p></div>}
      {isLost && <div className="alert error"><AlertTriangle size={16}/> Esta mascota tiene un reporte de pérdida activo. Si conoces su ubicación, informa al propietario.</div>}
      <div className="public-qr-actions">
        <button className="primary-button full" onClick={() => continueTo(`/usuario/chat?codigo=${encodeURIComponent(data.codigo || codigo)}`)}><MessageCircle size={17}/>Iniciar chat seguro en Huellitas</button>
        <button className="secondary-button full" onClick={() => continueTo(`/usuario/reportar?tipo=ENCONTRADA&mascota_id=${encodeURIComponent(pet.id)}`)}><MapPin size={17}/>Reportar que la encontré</button>
        <button className="secondary-button full" onClick={() => continueTo('/usuario/reportar?tipo=ENCONTRADA')}><Camera size={17}/>Reportar un hallazgo manualmente</button>
      </div>
      <p className="public-qr-footer"><CheckCircle size={15}/> Identificación consultada de forma segura.</p>
    </section>
  </main>;
}
