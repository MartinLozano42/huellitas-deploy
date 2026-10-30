import { useState } from 'react';
import { Camera, PawPrint, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

const NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9' ._-]{1,100}$/;

export default function UserMascotaNueva() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre:'', especie:'PERRO', raza:'', sexo:'MACHO', edad:'0', vacunado:'SI', caracteristicas:'', foto:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');

  function change(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); }

  async function uploadPetPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Elige una imagen JPG, PNG o WEBP.'); return;
    }
    if (file.size > 15 * 1024 * 1024) { setError('La imagen original debe pesar menos de 15 MB. Se optimizará antes de enviarla.'); return; }
    setError(''); setUploadingPhoto(true);
    try {
      const optimized = await prepareImageForUpload(file);
      const { data: result } = await api.post('/user/uploads/imagen', optimized);
      setForm((current) => ({ ...current, foto: result.url }));
      setPhotoPreview(result.url);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'No se pudo subir la fotografía.');
    } finally { setUploadingPhoto(false); }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    const nombre = form.nombre.trim();
    const edad = Number(form.edad);
    const foto = form.foto.trim();

    if (!NAME_RE.test(nombre)) { setError('Ingresa un nombre válido para la mascota.'); return; }
    if (!Number.isInteger(edad) || edad < 0 || edad > 40) { setError('La edad debe ser un número entero entre 0 y 40.'); return; }
    if (foto && !/^https?:\/\//i.test(foto) && !/^\/uploads\/images\/[A-Za-z0-9._-]+$/.test(foto)) { setError('La foto debe ser una URL válida o una imagen cargada en Huellitas.'); return; }

    setLoading(true);
    try {
      const { data } = await api.post('/user/mascotas', { ...form, nombre, edad, foto });
      navigate(`/usuario/mascotas/${data.mascota.id}`, { state: { message: data.message } });
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo registrar la mascota.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header"><div><div className="page-title-row"><PawPrint size={24} /><h1>Registrar mascota</h1></div><p>Completa los datos básicos para crear su ficha.</p></div></div>
      {error && <div className="alert error">{error}</div>}
      <div className="panel form-panel">
        <form onSubmit={submit} className="form-grid user-form">
          <label>Nombre de la mascota<input name="nombre" value={form.nombre} onChange={change} maxLength={100} required /></label>
          <label>Especie<select name="especie" value={form.especie} onChange={change}><option value="PERRO">Perro</option><option value="GATO">Gato</option><option value="OTRO">Otro</option></select></label>
          <label>Raza<input name="raza" value={form.raza} onChange={change} maxLength={100} placeholder="Opcional" /></label>
          <label>Sexo<select name="sexo" value={form.sexo} onChange={change}><option value="MACHO">Macho</option><option value="HEMBRA">Hembra</option></select></label>
          <label>Edad<input name="edad" type="number" min="0" max="40" value={form.edad} onChange={change} required /></label>
          <label>Vacunado<select name="vacunado" value={form.vacunado} onChange={change}><option value="SI">Sí</option><option value="NO">No</option></select></label>
          <label className="full-span">Características<textarea name="caracteristicas" value={form.caracteristicas} onChange={change} rows="4" maxLength={1000} placeholder="Color, señas particulares, etc." /></label>
          <div className="full-span"><span className="field-label">Fotografía de la mascota</span><label className="report-photo-uploader"><Camera size={24}/><strong>{uploadingPhoto ? 'Subiendo fotografía…' : 'Seleccionar fotografía'}</strong><span>JPG, PNG o WEBP · se optimiza antes de subir</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPetPhoto} disabled={uploadingPhoto}/></label><label className="pet-image-url-label">O pega una URL de imagen existente<input name="foto" value={form.foto} onChange={(e) => { change(e); setPhotoPreview(e.target.value); }} placeholder="https://..." /></label>{(photoPreview || form.foto) && <div className="report-photo-preview"><img src={mediaUrl(photoPreview || form.foto)} alt="Vista previa de la mascota"/><span>Vista previa de la fotografía</span><button className="link-button" type="button" onClick={() => { setForm((f) => ({ ...f, foto: '' })); setPhotoPreview(''); }}>Quitar foto</button></div>}</div>
          <div className="form-actions full-span"><button type="button" className="secondary-button" onClick={() => navigate('/usuario/mascotas')}>Cancelar</button><button className="primary-button" disabled={loading || uploadingPhoto}><Save size={17} />{loading ? 'Guardando...' : 'Guardar mascota'}</button></div>
        </form>
      </div>
    </div>
  );
}
