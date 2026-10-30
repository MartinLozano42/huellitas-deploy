import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Image as ImageIcon, PawPrint } from 'lucide-react';
import api, { mediaUrl } from '../api.js';

const palettes = {
  impacto: {
    rojo: { top: '#b91c1c', accent: '#facc15', bottom: '#b91c1c', ink: '#17212b' },
    azul: { top: '#075985', accent: '#f59e0b', bottom: '#082f49', ink: '#ffffff' },
    verde: { top: '#166534', accent: '#fde047', bottom: '#14532d', ink: '#ffffff' },
    morado: { top: '#6b21a8', accent: '#f5d0fe', bottom: '#3b0764', ink: '#ffffff' },
    rosa: { top: '#be185d', accent: '#fce7f3', bottom: '#831843', ink: '#ffffff' },
    negro: { top: '#111827', accent: '#fbbf24', bottom: '#030712', ink: '#ffffff' }
  },
  comunidad: {
    oceano: { top: '#123b5d', accent: '#42c6c5', bottom: '#e8f4f5', ink: '#123047', secondary: '#087e8b' },
    lavanda: { top: '#49306b', accent: '#e2b8ff', bottom: '#f5effb', ink: '#35234d', secondary: '#8054a6' },
    coral: { top: '#9f3d3d', accent: '#ffb199', bottom: '#fff1eb', ink: '#542d32', secondary: '#d96b59' },
    bosque: { top: '#245b4a', accent: '#c5df9b', bottom: '#eff6e9', ink: '#234638', secondary: '#54866a' },
    atardecer: { top: '#59415f', accent: '#ffc857', bottom: '#fff5df', ink: '#443348', secondary: '#d17b45' },
    carbon: { top: '#303943', accent: '#c4e86b', bottom: '#edf1f2', ink: '#26313a', secondary: '#647d36' }
  }
};

export default function UserAfichePerdida() {
  const canvasRef = useRef(null);
  const [searchParams] = useSearchParams();
  const [pets, setPets] = useState([]);
  const [error, setError] = useState('');
  const [petId, setPetId] = useState('');
  const [form, setForm] = useState({ ubicacion: '', fecha: new Date().toISOString().slice(0, 10), contacto: '', descripcion: '', color: 'rojo', plantilla: 'impacto' });
  const [photo, setPhoto] = useState('');
  const [photoLoaded, setPhotoLoaded] = useState(null);

  useEffect(() => { api.get('/user/mascotas').then(({ data }) => { setPets(data); const requested = data.find((p) => String(p.id) === searchParams.get('mascota')); const initial = requested || data[0]; if (initial) { setPetId(String(initial.id)); setPhoto(initial.foto || ''); } }).catch((e) => setError(e.response?.data?.message || 'No se pudieron cargar tus mascotas.')); }, [searchParams]);
  const pet = pets.find((p) => String(p.id) === String(petId));

  useEffect(() => {
    let cancelled = false;
    setPhotoLoaded(null);
    if (!photo) return;
    const img = new Image();
    // Solo activamos CORS para imágenes externas; las fotos locales se sirven desde el backend.
    const resolved = mediaUrl(photo);
    try { if (new URL(resolved).origin !== window.location.origin) img.crossOrigin = 'anonymous'; } catch {}
    img.onload = () => { if (!cancelled) { setPhotoLoaded(img); setError(''); } };
    img.onerror = () => { if (!cancelled) { setPhotoLoaded(null); setError('No se encontró la foto guardada. Vuelve a subirla desde Editar mascota; si usas almacenamiento local, conserva la carpeta backend/uploads.'); } };
    img.src = resolved;
    return () => { cancelled = true; };
  }, [photo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = 800;
    const h = 1120;
    const c = (palettes[form.plantilla] || palettes.impacto)[form.color] || palettes.impacto.rojo;
    canvas.width = w;
    canvas.height = h;

    const drawPetPhoto = (x, y, width, height, radius = 0) => {
      ctx.save();
      if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        ctx.clip();
      }
      ctx.fillStyle = '#e5edf1';
      ctx.fillRect(x, y, width, height);
      if (photoLoaded) {
        const scale = Math.min(width / photoLoaded.width, height / photoLoaded.height);
        const dw = photoLoaded.width * scale;
        const dh = photoLoaded.height * scale;
        // Contain the whole photo instead of zooming/cropping the pet's face.
        ctx.fillStyle = '#e5edf1';
        ctx.fillRect(x, y, width, height);
        ctx.drawImage(photoLoaded, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('FOTO DE LA MASCOTA', x + width / 2, y + height / 2);
      }
      ctx.restore();
    };

    const drawCentered = (text, y, font, color, maxWidth = 720) => {
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.font = font;
      let value = String(text || '');
      while (ctx.measureText(value).width > maxWidth && font.match(/\d+/)) {
        const size = Number(font.match(/\d+/)[0]);
        if (size <= 18) break;
        ctx.font = font.replace(/\d+px/, `${size - 2}px`);
      }
      ctx.fillText(value, w / 2, y, maxWidth);
    };

    ctx.clearRect(0, 0, w, h);

    if (form.plantilla === 'comunidad') {
      // Alternative design: modern, airy layout with a smaller photo and clear information blocks.
      const navy = c.top;
      const blue = c.secondary;
      const orange = c.accent;
      ctx.fillStyle = c.bottom;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = navy;
      ctx.fillRect(0, 0, w, 190);
      ctx.fillStyle = orange;
      ctx.fillRect(0, 0, w, 14);
      drawCentered('¿LA HAS VISTO?', 76, '900 46px Arial', '#ffffff', 740);
      drawCentered('AYÚDANOS A ENCONTRARLA', 133, 'bold 31px Arial', orange, 740);
      ctx.fillStyle = c.bottom === '#e8f4f5' ? '#ffffff' : '#ffffff';
      ctx.fillRect(42, 168, 716, 56);
      drawCentered((pet?.nombre || 'NOMBRE DE LA MASCOTA').toLocaleUpperCase().slice(0, 32), 207, 'bold 31px Arial', navy, 680);
      drawPetPhoto(115, 245, 570, 330, 18);
      ctx.fillStyle = blue;
      ctx.fillRect(42, 600, 716, 10);
      drawCentered('ÚLTIMA UBICACIÓN', 654, 'bold 25px Arial', navy, 700);
      ctx.fillStyle = navy;
      ctx.font = 'bold 31px Arial';
      wrapText(ctx, form.ubicacion.trim() || 'Añade la ubicación', w / 2, 700, 680, 38, 2);
      if (form.descripcion.trim()) {
        ctx.fillStyle = c.ink;
        ctx.font = 'italic 21px Arial';
        wrapText(ctx, form.descripcion.trim(), w / 2, 776, 680, 27, 2);
      }
      ctx.fillStyle = c.bottom;
      ctx.fillRect(42, 838, 716, 116);
      drawCentered('SI TIENES INFORMACIÓN, CONTÁCTANOS', 880, 'bold 21px Arial', navy, 680);
      drawCentered(form.contacto.trim() || 'Añade teléfono de contacto', 924, 'bold 30px Arial', blue, 680);
      ctx.fillStyle = orange;
      ctx.fillRect(42, 980, 716, 70);
      drawCentered('¡AYÚDANOS A QUE VUELVA A CASA!', 1024, 'bold 24px Arial', navy, 680);
      drawCentered(`${pet?.especie || 'MASCOTA'}${pet?.raza ? ` · ${pet.raza}` : ''}${form.fecha ? ` · ${form.fecha}` : ''}`, 1085, '18px Arial', c.ink, 720);
    } else {
      // Classic design: scaled headline and a smaller, uncropped pet photo.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = c.top;
      ctx.fillRect(0, 0, w, 132);
      drawCentered('MASCOTA PERDIDA', 57, '900 43px Arial', c.ink, 740);
      drawCentered('AYÚDANOS A ENCONTRARLA', 103, 'bold 29px Arial', c.ink, 740);
      ctx.fillStyle = c.accent;
      ctx.fillRect(44, 126, w - 88, 58);
      drawCentered((pet?.nombre || 'NOMBRE DE LA MASCOTA').toLocaleUpperCase().slice(0, 32), 165, 'bold 31px Arial', c.top === '#b91c1c' ? '#111827' : c.bottom, 680);
      drawPetPhoto(100, 205, 600, 345, 8);
      ctx.fillStyle = c.bottom;
      ctx.fillRect(0, 575, w, 545);
      drawCentered('VISTO POR ÚLTIMA VEZ EN:', 625, 'bold 26px Arial', c.ink, 740);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 31px Arial';
      wrapText(ctx, form.ubicacion.trim() || 'Añade la ubicación', w / 2, 674, 690, 38, 2);
      if (form.descripcion.trim()) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 20px Arial';
        wrapText(ctx, form.descripcion.trim(), w / 2, 745, 690, 26, 2);
      }
      ctx.fillStyle = c.accent;
      ctx.fillRect(52, 802, w - 104, 5);
      drawCentered('SI LA VES, ¡CONTÁCTANOS!', 850, 'bold 25px Arial', c.ink, 720);
      drawCentered(form.contacto.trim() || 'Añade teléfono de contacto', 901, 'bold 31px Arial', '#ffffff', 720);
      ctx.fillStyle = c.accent;
      ctx.fillRect(44, 945, w - 88, 70);
      drawCentered('¡AYÚDANOS A QUE VUELVA A CASA!', 989, 'bold 24px Arial', c.bottom, 680);
      drawCentered(`${pet?.especie || 'MASCOTA'}${pet?.raza ? ` · ${pet.raza}` : ''}${form.fecha ? ` · ${form.fecha}` : ''}`, 1065, '18px Arial', c.ink, 720);
    }
  }, [pet, form, photoLoaded]);

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(/\s+/); let line = ''; let lines = [];
    for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
    if (line) lines.push(line); lines = lines.slice(0, maxLines);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  }

  function selectPet(e) { const id = e.target.value; setPetId(id); const chosen = pets.find((p) => String(p.id) === id); setPhoto(chosen?.foto || ''); }
  function download() {
    const canvas = canvasRef.current; if (!canvas || !pet) return;
    try { const link = document.createElement('a'); link.download = `Huellitas-afiche-${pet.nombre.replace(/[^a-z0-9-_]/gi, '-')}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }
    catch { setError('No se pudo exportar la foto. Si procede de un servicio externo, comprueba que permita exportación desde el navegador.'); }
  }

  return <div>
    <div className="page-header"><div><div className="page-title-row"><ImageIcon size={24}/><h1>Generador de afiches</h1></div><p>Diseña y descarga un afiche para compartir manualmente. No necesita conectar redes sociales.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {!pets.length ? <div className="empty-state"><PawPrint size={32}/><p>Primero registra una mascota para crear su afiche.</p></div> : <div className="poster-workspace">
      <section className="panel poster-controls"><h2>Personaliza el aviso</h2>
        <label>Mascota registrada<select value={petId} onChange={selectPet}>{pets.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.especie}</option>)}</select></label>
        <label>Plantilla<select value={form.plantilla} onChange={(e) => setForm((f) => ({ ...f, plantilla: e.target.value, color: e.target.value === 'comunidad' ? 'oceano' : 'rojo' }))}><option value="impacto">Impacto clásico</option><option value="comunidad">Ayuda de la comunidad</option></select></label>
        <label>Colores<select value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}>{(form.plantilla === 'comunidad' ? [['oceano','Océano y turquesa'],['lavanda','Lavanda y violeta'],['coral','Coral y crema'],['bosque','Bosque y salvia'],['atardecer','Atardecer y ámbar'],['carbon','Carbón y lima']] : [['rojo','Rojo y amarillo'],['azul','Azul y naranja'],['verde','Verde y amarillo'],['morado','Morado'],['rosa','Rosa'],['negro','Negro y dorado']]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Ubicación donde se perdió<input value={form.ubicacion} maxLength={140} onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))} placeholder="Barrio, calle o referencia"/></label>
        <label>Fecha<input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}/></label>
        <label>Contacto que quieres publicar<input value={form.contacto} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} placeholder="Teléfono de contacto"/></label>
        <label>Descripción breve (opcional)<textarea rows="3" maxLength={250} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Señas particulares…"/></label>
        <label>Foto para el afiche<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => { setPhoto(String(reader.result)); setPhotoLoaded(null); }; reader.readAsDataURL(file); } }}/></label>
        <button className="primary-button" type="button" onClick={download} disabled={!pet}><Download size={17}/>Descargar afiche PNG</button>
        <p className="muted">Publica solo los datos de contacto que quieras hacer visibles. El afiche se genera en tu navegador.</p>
      </section>
      <section className="panel poster-preview"><h2>Vista previa</h2><canvas ref={canvasRef} aria-label="Vista previa del afiche de mascota perdida"/><button className="primary-button" type="button" onClick={download} disabled={!pet}><Download size={17}/>Descargar PNG</button></section>
    </div>}
  </div>;
}
