import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  MapPin,
  PawPrint,
  Send,
  ShieldCheck
} from 'lucide-react';
import api, { mediaUrl } from '../api.js';

export default function PublicQrPage() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    api.get(`/public/qr/${encodeURIComponent(codigo)}`)
      .then(({ data: response }) => { if (active) setData(response); })
      .catch((e) => { if (active) setError(e.response?.data?.message || 'No se pudo consultar el código QR.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [codigo]);

  async function sendAnonymousNotice(event) {
    event.preventDefault();
    setSending(true);
    setSendError('');
    setNotice('');
    try {
      const { data: response } = await api.post(
        `/public/qr/${encodeURIComponent(codigo)}/aviso`,
        { mensaje: mensaje.trim(), ubicacion: ubicacion.trim() }
      );
      setNotice(response.message || 'Aviso enviado correctamente.');
      setMensaje('');
      setUbicacion('');
    } catch (e) {
      setSendError(e.response?.data?.message || 'No se pudo enviar el aviso. Intenta nuevamente.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="public-qr-shell"><div className="public-qr-card"><div className="loading">Consultando identificación…</div></div></main>;
  if (error || !data?.mascota) return <main className="public-qr-shell"><div className="public-qr-card"><div className="public-qr-brand"><PawPrint size={26}/><strong>HUELLITAS</strong></div><div className="alert error">{error || 'No se encontró una mascota asociada a este QR.'}</div><button className="secondary-button full" onClick={() => navigate('/')}><ArrowLeft size={16}/>Volver al inicio</button></div></main>;

  const pet = data.mascota;
  const isLost = pet.estado === 'PERDIDA';

  return (
    <main className="public-qr-shell">
      <section className="public-qr-card">
        <div className="public-qr-brand"><PawPrint size={26}/><div><strong>HUELLITAS</strong><span>Identificación de mascota</span></div></div>
        <div className="public-qr-intro">
          <h1>{isLost ? 'Esta mascota está reportada como perdida' : 'Identificación de mascota'}</h1>
          <p>Consulta sus datos y, si tienes información, envía un aviso sin crear una cuenta.</p>
        </div>

        <div className="public-qr-pet">
          <div className="public-qr-photo">{pet.foto ? <img src={mediaUrl(pet.foto)} alt={`Foto de ${pet.nombre}`}/> : <PawPrint size={44}/>}</div>
          <div>
            <span className={`report-type-pill ${isLost ? 'lost' : 'found'}`}>{isLost ? 'REPORTE DE PÉRDIDA ACTIVO' : 'QR HUELLITAS ACTIVO'}</span>
            <h2>{pet.nombre}</h2>
            <p>{[pet.especie, pet.raza, pet.sexo, pet.edad != null ? `${pet.edad} años` : ''].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        {pet.caracteristicas && <div className="public-qr-description"><strong>Características</strong><p>{pet.caracteristicas}</p></div>}
        {isLost && <div className="alert error"><AlertTriangle size={16}/> Esta mascota tiene un reporte de pérdida activo.</div>}

        <div className="public-qr-info"><ShieldCheck size={18}/><p>Tu aviso se enviará de forma anónima al propietario y al equipo administrador. No solicitamos tu nombre, teléfono ni correo.</p></div>

        <form className="public-qr-notice-form" onSubmit={sendAnonymousNotice}>
          <h3>¿Tienes información sobre esta mascota?</h3>
          <label htmlFor="qr-notice-message">Tu aviso</label>
          <textarea
            id="qr-notice-message"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            minLength={5}
            maxLength={1000}
            rows={4}
            placeholder="Ej.: La vi cerca de la plaza principal. Está caminando por la zona…"
            required
          />
          <label htmlFor="qr-notice-location">Ubicación aproximada (opcional)</label>
          <input
            id="qr-notice-location"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            maxLength={180}
            placeholder="Ej.: Plaza principal, zona norte"
          />
          {sendError && <div className="alert error">{sendError}</div>}
          {notice && <div className="alert success"><CheckCircle size={17}/>{notice}</div>}
          <button className="primary-button full" type="submit" disabled={sending || mensaje.trim().length < 5}>
            <Send size={17}/>{sending ? 'Enviando aviso…' : 'Enviar aviso anónimo'}
          </button>
        </form>

        <p className="public-qr-footer"><CheckCircle size={15}/> No necesitas iniciar sesión para enviar este aviso.</p>
      </section>
    </main>
  );
}
