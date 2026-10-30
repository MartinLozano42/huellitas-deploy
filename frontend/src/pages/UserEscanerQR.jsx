import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, ImageUp, PawPrint, QrCode, RefreshCw, MessageCircle, MapPin } from 'lucide-react';
import api, { mediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

function getCode(value) {
  const text = String(value || '').trim();
  const match = text.match(/(?:PRM|HUE)-[A-Z0-9-]+/i);
  if (match) return match[0].toUpperCase();
  try {
    const url = new URL(text);
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    const pathMatch = last.match(/(?:PRM|HUE)-[A-Z0-9-]+/i);
    if (pathMatch) return pathMatch[0].toUpperCase();
  } catch { /* QR may contain a raw code rather than a URL. */ }
  return text.toUpperCase();
}

export default function UserEscanerQR() {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pet, setPet] = useState(null);
  const [rawCode, setRawCode] = useState('');
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const processingRef = useRef(false);

  useEffect(() => () => { stopCamera(); }, []); // stops the camera when leaving this page

  async function resolveQr(decodedText) {
    if (!decodedText) return;
    if (processingRef.current) return;
    processingRef.current = true;
    const code = getCode(decodedText);
    setRawCode(code); setPet(null); setError(''); setMessage(''); setBusy(true);
    try {
      const { data } = await api.get(`/public/qr/${encodeURIComponent(code)}`);
      setPet(data.mascota);
      setMessage(`QR ${data.codigo} reconocido correctamente.`);
      await stopCamera();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo reconocer el QR. Asegúrate de que sea una identificación activa de Huellitas.');
    } finally { setBusy(false); processingRef.current = false; }
  }

  async function startCamera(cameraOverride = '') {
    setError(''); setMessage(''); setPet(null);
    try {
      const cameraHost = document.getElementById('huellitas-qr-camera');
      if (cameraHost && !scannerRef.current) cameraHost.innerHTML = '';
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode('huellitas-qr-camera');
      const available = await Html5Qrcode.getCameras();
      if (!available?.length) { setError('No se encontró una cámara disponible. Puedes subir una imagen del QR.'); return; }
      setCameras(available);
      const selected = cameraOverride && available.some(c => c.id === cameraOverride) ? cameraOverride : (cameraId && available.some(c => c.id === cameraId) ? cameraId : (available.find(c => /back|rear|trasera|environment/i.test(c.label))?.id || available[0].id));
      setCameraId(selected);
      await scannerRef.current.start(selected, { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 }, (text) => resolveQr(text), () => {});
      setCameraOn(true);
    } catch (e) {
      setError('No se pudo iniciar la cámara. Revisa los permisos del navegador y vuelve a intentar; también puedes subir una imagen.');
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) {
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { scanner.clear(); } catch { /* ignore cleanup error */ }
    }
    setCameraOn(false);
  }

  async function scanFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (cameraOn) await stopCamera();
    if (!file) return;
    setError(''); setMessage(''); setPet(null); setBusy(true);
    try {
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode('huellitas-qr-camera', { verbose: false });
      const text = await scannerRef.current.scanFile(file, true);
      await resolveQr(text);
    } catch {
      setError('No se detectó un código QR legible en esa imagen. Prueba con una foto más nítida y completa.');
    } finally { setBusy(false); }
  }

  return <div>
    <div className="page-header"><div><div className="page-title-row"><QrCode size={24}/><h1>Lector de QR</h1></div><p>Escanea con la cámara o selecciona una imagen del QR de Huellitas.</p></div></div>
    {message && <div className="alert success">{message}</div>}{error && <div className="alert error">{error}</div>}
    <div className="qr-reader-layout">
      <section className="panel qr-reader-panel">
        <div className="qr-reader-heading"><Camera size={20}/><div><h2>Leer con la cámara</h2><p>Permite el acceso a la cámara cuando el navegador lo solicite.</p></div></div>
        <div id="huellitas-qr-camera" className="qr-reader-camera"><div className="qr-reader-camera-empty"><QrCode size={48}/><span>La cámara aparecerá aquí</span></div></div>
        <div className="qr-reader-actions">
          {!cameraOn ? <button className="primary-button" type="button" onClick={startCamera}><Camera size={17}/>Iniciar cámara</button> : <button className="secondary-button" type="button" onClick={stopCamera}>Detener cámara</button>}
          {cameraOn && cameras.length > 1 && <select aria-label="Seleccionar cámara" value={cameraId} onChange={async e => { const id=e.target.value; setCameraId(id); await stopCamera(); setTimeout(() => startCamera(id), 100); }}><option value="">Seleccionar cámara</option>{cameras.map(c => <option key={c.id} value={c.id}>{c.label || 'Cámara'}</option>)}</select>}
        </div>
      </section>
      <section className="panel qr-reader-panel">
        <div className="qr-reader-heading"><ImageUp size={20}/><div><h2>Leer desde una imagen</h2><p>Sube una foto o captura que contenga el código QR completo.</p></div></div>
        <label className="qr-upload-box"><ImageUp size={38}/><strong>Seleccionar imagen</strong><span>PNG, JPG o WEBP</span><input type="file" accept="image/*" onChange={scanFile}/></label>
        <div className="qr-reader-actions">{busy && <span className="muted">Leyendo código…</span>}<button className="secondary-button" type="button" onClick={() => {setPet(null);setRawCode('');setMessage('');setError('');}}><RefreshCw size={15}/>Limpiar resultado</button></div>
      </section>
    </div>
    {pet && <section className="panel qr-scan-result"><div className="qr-result-icon">{pet.foto ? <img className="qr-result-pet-photo" src={mediaUrl(pet.foto)} alt={pet.nombre}/> : <PawPrint size={27}/>}</div><div className="qr-result-body"><div className="page-title-row"><h2>{pet.nombre}</h2><StatusBadge value={pet.estado}/></div><p>{pet.especie}{pet.raza ? ` · ${pet.raza}` : ''}{pet.sexo ? ` · ${pet.sexo}` : ''}</p><p>{pet.caracteristicas || 'Sin características registradas.'}</p><div className="user-pet-meta"><span>Edad: {pet.edad ?? '—'} años</span><span>Vacunado: {pet.vacunado || '—'}</span><span>Código: {rawCode}</span></div>{pet.estado === 'PERDIDA' && <div className="alert error">Esta mascota figura como perdida. Puedes avisar del hallazgo y contactar al propietario.</div>}<div className="user-pet-actions qr-contact-actions"><button className="primary-button compact" onClick={() => navigate(`/usuario/chat?codigo=${encodeURIComponent(rawCode)}`)}><MessageCircle size={15}/>Iniciar chat seguro en la app</button><button className="secondary-button compact" onClick={() => navigate(`/usuario/reportar?tipo=ENCONTRADA&mascota_id=${encodeURIComponent(pet.id)}`, { state: { pet } })}><MapPin size={15}/>Reportar hallazgo</button><button className="secondary-button compact" onClick={() => navigate('/usuario/reportar?tipo=PERDIDA')}>Reportar mascota perdida</button></div></div></section>}
  </div>;
}
