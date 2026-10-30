import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, PawPrint, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import { prepareImageForUpload } from '../imageUpload.js';

export default function UserMascotaEditar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    api.get(`/user/mascotas/${id}`).then(({ data }) => {
      setForm({ nombre: data.nombre || '', especie: data.especie || 'PERRO', raza: data.raza || '', sexo: data.sexo || 'MACHO', edad: String(data.edad ?? 0), vacunado: data.vacunado || 'SI', caracteristicas: data.caracteristicas || '', foto: data.foto || '' });
      setPreview(data.foto || '');
    }).catch((e) => setError(e.response?.data?.message || 'No se pudo cargar la mascota.'));
  }, [id]);

  function change(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setError(''); setUploading(true);
    try {
      const optimized = await prepareImageForUpload(file);
      const { data } = await api.post('/user/uploads/imagen', optimized);
      setForm((f) => ({ ...f, foto: data.url })); setPreview(data.url);
    } catch (err) { setError(err.response?.data?.message || err.message || 'No se pudo subir la foto.'); }
    finally { setUploading(false); }
  }

  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const payload = { ...form, nombre: form.nombre.trim(), edad: Number(form.edad), foto: form.foto.trim() };
      const { data } = await api.put(`/user/mascotas/${id}`, payload);
      navigate(`/usuario/mascotas/${id}`, { state: { message: data.message } });
    } catch (err) { setError(err.response?.data?.message || 'No se pudo actualizar la mascota.'); }
    finally { setLoading(false); }
  }

  if (!form) return <div>{error ? <div className="alert error">{error}</div> : <div className="loading">Cargando mascota...</div>}</div>;
  return <div>
    <div className="page-header"><div><button className="icon-button" type="button" onClick={() => navigate(`/usuario/mascotas/${id}`)}><ArrowLeft size={17}/></button><div className="page-title-row"><PawPrint size={24}/><h1>Editar mascota</h1></div><p>Actualiza los datos de tu mascota. Su QR existente se conserva.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="panel form-panel"><form className="form-grid user-form" onSubmit={submit}>
      <label>Nombre<input name="nombre" value={form.nombre} onChange={change} maxLength={100} required/></label>
      <label>Especie<select name="especie" value={form.especie} onChange={change}><option value="PERRO">Perro</option><option value="GATO">Gato</option><option value="OTRO">Otro</option></select></label>
      <label>Raza<input name="raza" value={form.raza} onChange={change} maxLength={100}/></label>
      <label>Sexo<select name="sexo" value={form.sexo} onChange={change}><option value="MACHO">Macho</option><option value="HEMBRA">Hembra</option></select></label>
      <label>Edad<input name="edad" type="number" min="0" max="40" value={form.edad} onChange={change} required/></label>
      <label>Vacunado<select name="vacunado" value={form.vacunado} onChange={change}><option value="SI">Sí</option><option value="NO">No</option></select></label>
      <label className="full-span">Características<textarea name="caracteristicas" rows="4" maxLength={1000} value={form.caracteristicas} onChange={change}/></label>
      <div className="full-span"><span className="field-label">Fotografía</span><label className="report-photo-uploader"><Camera size={24}/><strong>{uploading ? 'Subiendo fotografía…' : 'Cambiar fotografía'}</strong><span>JPG, PNG o WEBP · se optimiza antes de subir</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={uploading}/></label>
      {preview && <div className="report-photo-preview"><img src={mediaUrl(preview)} alt="Vista previa"/><span>Foto actual</span><button className="link-button" type="button" onClick={() => { setForm((f) => ({ ...f, foto: '' })); setPreview(''); }}>Quitar foto</button></div>}
      </div>
      <div className="form-actions full-span"><button type="button" className="secondary-button" onClick={() => navigate(`/usuario/mascotas/${id}`)}>Cancelar</button><button className="primary-button" disabled={loading || uploading}><Save size={17}/>{loading ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form></div>
  </div>;
}
