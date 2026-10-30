import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, PawPrint } from 'lucide-react';
import api from '../api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]{2,100}$/;
const CI_RE = /^[0-9]{5,20}$/;
const PHONE_RE = /^[0-9+() -]{7,30}$/;

function strongPassword(password) {
  return password.length >= 8
    && /[A-ZÁÉÍÓÚÑ]/.test(password)
    && /[a-záéíóúñ]/.test(password)
    && /\d/.test(password);
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    nombre: '', apellido: '', ci: '', email: '', telefono: '', password: '', confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function change(e) {
    setForm((current) => ({ ...current, [e.target.name]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    const nombre = form.nombre.trim();
    const apellido = form.apellido.trim();
    const ci = form.ci.trim();
    const email = form.email.trim().toLowerCase();
    const telefono = form.telefono.trim();

    if (!NAME_RE.test(nombre) || !NAME_RE.test(apellido)) {
      setError('Nombre y apellido solo deben contener letras, espacios o guiones.');
      return;
    }
    if (!CI_RE.test(ci)) {
      setError('El CI debe contener entre 5 y 20 dígitos.');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (telefono && !PHONE_RE.test(telefono)) {
      setError('El teléfono contiene caracteres no válidos.');
      return;
    }
    if (!strongPassword(form.password)) {
      setError('La contraseña debe tener 8 caracteres e incluir mayúscula, minúscula y número.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        nombre,
        apellido,
        ci,
        email,
        telefono,
        password: form.password,
      });

      setMessage(data.message);
      setForm({ nombre: '', apellido: '', ci: '', email: '', telefono: '', password: '', confirmPassword: '' });
      setTimeout(() => navigate('/login', { state: { ...location.state, notice: 'Cuenta creada. Cuando el administrador la apruebe, podrás continuar con la acción pendiente.' } }), 1600);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card register-card">
        <div className="login-brand">
          <div className="login-mark"><PawPrint size={26} /></div>
          <div><strong>HUELLITAS</strong><span>Crear cuenta</span></div>
        </div>

        <div className="login-copy">
          <h1>Crear cuenta</h1>
          <p>Completa tus datos. Tu cuenta quedará pendiente hasta que el Admin la apruebe.</p>
        </div>

        <form onSubmit={submit} className="form-grid">
          <label>Nombre<input name="nombre" value={form.nombre} onChange={change} maxLength={100} autoComplete="given-name" required /></label>
          <label>Apellido<input name="apellido" value={form.apellido} onChange={change} maxLength={100} autoComplete="family-name" required /></label>
          <label>CI<input name="ci" value={form.ci} onChange={change} inputMode="numeric" maxLength={20} required /></label>
          <label>Teléfono<input name="telefono" value={form.telefono} onChange={change} inputMode="tel" maxLength={30} autoComplete="tel" /></label>
          <label className="full-span">Correo electrónico<input name="email" type="email" value={form.email} onChange={change} maxLength={150} autoComplete="email" required /></label>
          <label>
            Contraseña
            <div className="password-field">
              <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={change} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <label>
            Confirmar contraseña
            <div className="password-field">
              <input name="confirmPassword" type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={change} autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowConfirm((v) => !v)} title={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <div className="password-help full-span">
            8 caracteres mínimo · una mayúscula · una minúscula · un número
          </div>

          {error && <div className="alert error full-span">{error}</div>}
          {message && <div className="alert success full-span">{message}</div>}

          <button className="primary-button full-span" disabled={loading}>
            {loading ? 'Creando...' : 'Crear cuenta'}
          </button>

          <button type="button" className="secondary-button full-span" onClick={() => navigate('/login', { state: location.state })}>
            Volver al login
          </button>
        </form>
      </div>
    </div>
  );
}
