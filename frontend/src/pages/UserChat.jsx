import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, PawPrint, Send } from 'lucide-react';
import api, { mediaUrl } from '../api.js';

function userId() {
  try { return Number(JSON.parse(localStorage.getItem('prm_user') || '{}').id); } catch { return 0; }
}
function dateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function UserChat() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(routeId || '');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const endRef = useRef(null);
  const startKeyRef = useRef('');
  const me = userId();

  const loadConversations = useCallback(async () => {
    try { const { data } = await api.get('/user/conversaciones'); setConversations(data); }
    catch (e) { setError(e.response?.data?.message || 'No se pudieron cargar tus conversaciones.'); }
  }, []);

  useEffect(() => { loadConversations(); const poll = window.setInterval(loadConversations, 12000); return () => window.clearInterval(poll); }, [loadConversations]);

  useEffect(() => {
    setSelectedId(routeId || '');
  }, [routeId]);

  useEffect(() => {
    const codigo = searchParams.get('codigo');
    const reporteId = searchParams.get('reporte_id');
    const avistamientoId = searchParams.get('avistamiento_id');
    const key = codigo ? `qr:${codigo}` : reporteId ? `report:${reporteId}` : avistamientoId ? `sighting:${avistamientoId}` : '';
    if (!key) { startKeyRef.current = ''; return; }
    if (startKeyRef.current === key) return;
    startKeyRef.current = key;
    let active = true;
    setError(''); setNotice('Iniciando conversación segura…');
    const payload = codigo ? { codigo } : reporteId ? { reporte_id: Number(reporteId) } : { avistamiento_id: Number(avistamientoId) };
    api.post('/user/conversaciones', payload)
      .then(({ data }) => { if (!active) return; setNotice(data.message); navigate(`/usuario/chat/${data.conversacion_id}`, { replace: true }); loadConversations(); })
      .catch((e) => { if (!active) return; startKeyRef.current = ''; setError(e.response?.data?.message || 'No se pudo iniciar la conversación.'); setNotice(''); });
    return () => { active = false; };
  }, [searchParams, navigate, loadConversations]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let active = true;
    async function loadMessages() {
      try { const { data } = await api.get(`/user/conversaciones/${selectedId}/mensajes`); if (active) { setMessages(data); setError(''); } }
      catch (e) { if (active) setError(e.response?.data?.message || 'No se pudieron cargar los mensajes.'); }
    }
    loadMessages(); const poll = window.setInterval(loadMessages, 4000);
    return () => { active = false; window.clearInterval(poll); };
  }, [selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const current = conversations.find((c) => String(c.id) === String(selectedId));

  async function sendMessage(event) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || !selectedId || busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/user/conversaciones/${selectedId}/mensajes`, { mensaje: value });
      setMessages((items) => [...items, { ...data, remitente_id: me }]); setDraft(''); await loadConversations();
    } catch (e) { setError(e.response?.data?.message || 'No se pudo enviar el mensaje.'); }
    finally { setBusy(false); }
  }

  return <div>
    <div className="page-header"><div><h1>Chat seguro</h1><p>Comunícate con otros usuarios para ayudar a reunir mascotas con sus familias.</p></div></div>
    {notice && <div className="alert success">{notice}</div>}{error && <div className="alert error">{error}</div>}
    <div className="chat-workspace panel">
      <aside className={`chat-conversation-list ${selectedId ? 'mobile-hidden' : ''}`}>
        <div className="chat-list-title"><MessageCircle size={18}/><strong>Conversaciones</strong></div>
        {conversations.length === 0 ? <div className="chat-empty-small"><PawPrint size={26}/><p>Aún no tienes conversaciones.</p><small>Escanea el QR de una mascota o abre un reporte y pulsa «Contactar».</small></div> : conversations.map((c) => <button key={c.id} className={`chat-conversation-row ${String(c.id) === String(selectedId) ? 'active' : ''}`} onClick={() => navigate(`/usuario/chat/${c.id}`)}><div className="chat-avatar">{c.foto_mascota ? <img src={mediaUrl(c.foto_mascota)} alt=""/> : <PawPrint size={18}/>}</div><div className="chat-conversation-summary"><strong>{c.otro_usuario || 'Usuario'}</strong><span>{c.mascota || 'Mascota'}</span><small>{c.ultimo_mensaje || 'Inicia la conversación'}</small></div>{Number(c.no_leidos) > 0 && <b className="chat-unread-count">{c.no_leidos}</b>}</button>)}
      </aside>
      <section className={`chat-conversation-view ${!selectedId ? 'mobile-hidden' : ''}`}>
        {!selectedId ? <div className="chat-no-selection"><MessageCircle size={42}/><h2>Tus conversaciones</h2><p>Selecciona una conversación para continuar.</p></div> : <>
          <header className="chat-thread-header"><button className="icon-button chat-back" onClick={() => navigate('/usuario/chat')} title="Volver a conversaciones"><ArrowLeft size={18}/></button><div className="chat-avatar">{current?.foto_mascota ? <img src={mediaUrl(current.foto_mascota)} alt=""/> : <PawPrint size={18}/>}</div><div><strong>{current?.otro_usuario || 'Conversación'}</strong><span>{current?.mascota || 'Mascota'} · Chat privado</span></div></header>
          <div className="chat-message-list">{messages.length === 0 ? <div className="chat-no-selection"><PawPrint size={32}/><p>Esta conversación está lista. Envía el primer mensaje.</p></div> : messages.map((m) => { const mine = Number(m.remitente_id) === me; return <div className={`chat-message-row ${mine ? 'mine' : 'theirs'}`} key={m.id}><div className="chat-bubble"><p>{m.contenido ?? m.mensaje ?? ''}</p><small>{dateTime(m.created_at)}{mine && m.leido_at ? ' · leído' : ''}</small></div></div>; })}<div ref={endRef}/></div>
          <form className="chat-composer" onSubmit={sendMessage}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe un mensaje seguro…" maxLength={2000} rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/><button className="primary-button" disabled={busy || !draft.trim()} title="Enviar mensaje"><Send size={16}/></button></form>
        </>}
      </section>
    </div>
  </div>;
}
