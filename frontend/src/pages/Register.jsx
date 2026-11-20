import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, PawPrint } from 'lucide-react';
import api from '../api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]{2,100}$/;
const CI_RE = /^[0-9]{5,20}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

function normalizePhone(value) {
  return value.replace(/[\s()-]/g, '');
}

function strongPassword(password) {
  return (
    password.length >= 8 &&
    password.length <= 72 &&
    /[A-ZÁÉÍÓÚÑ]/.test(password) &&
    /[a-záéíóúñ]/.test(password) &&
    /\d/.test(password)
  );
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    ci: '',
    email: '',
    telefono: '',
    password: '',
    confirmPassword: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function change(e) {
    const { name, value } = e.target;

    setForm(current => ({
      ...current,
      [name]: value
    }));

    setError('');
    setMessage('');
  }

  async function submit(e) {
    e.preventDefault();

    setError('');
    setMessage('');

    const nombre = form.nombre.trim().replace(/\s+/g, ' ');
    const apellido = form.apellido.trim().replace(/\s+/g, ' ');
    const ci = form.ci.trim();
    const email = form.email.trim().toLowerCase();
    const telefono = normalizePhone(form.telefono.trim());

    if (!NAME_RE.test(nombre)) {
      setError('El nombre debe tener entre 2 y 100 caracteres y contener únicamente letras, espacios, apóstrofes o guiones.');
      return;
    }

    if (!NAME_RE.test(apellido)) {
      setError('El apellido debe tener entre 2 y 100 caracteres y contener únicamente letras, espacios, apóstrofes o guiones.');
      return;
    }

    if (!CI_RE.test(ci)) {
      setError('El CI debe contener entre 5 y 20 números, sin letras ni símbolos.');
      return;
    }

    if (!EMAIL_RE.test(email) || email.length > 150) {
      setError('Ingresa un correo electrónico válido de máximo 150 caracteres.');
      return;
    }

    if (form.telefono.trim() && !PHONE_RE.test(telefono)) {
      setError('El teléfono debe contener entre 7 y 15 dígitos. Puedes utilizar un prefijo internacional con +.');
      return;
    }

    if (!strongPassword(form.password)) {
      setError('La contraseña debe tener entre 8 y 72 caracteres e incluir una mayúscula, una minúscula y un número.');
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
        password: form.password
      });

      setMessage(data.message);

      setForm({
        nombre: '',
        apellido: '',
        ci: '',
        email: '',
        telefono: '',
        password: '',
        confirmPassword: ''
      });

      setTimeout(() => {
        navigate('/login', {
          state: {
            ...location.state,
            notice: 'Cuenta creada. Cuando el administrador la apruebe, podrás continuar con la acción pendiente.'
          }
        });
      }, 1600);

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
          <div className="login-mark">
            <PawPrint size={26} />
          </div>
          <div>
            <strong>HUELLITAS</strong>
            <span>Crear cuenta</span>
          </div>
        </div>

        <div className="login-copy">
          <h1>Crear cuenta</h1>
          <p>
            Completa tus datos. Tu cuenta quedará pendiente hasta que el Admin la apruebe.
          </p>
        </div>

        <form onSubmit={submit} className="form-grid" noValidate>

          <label>
            Nombre
            <input
              name="nombre"
              value={form.nombre}
              onChange={change}
              maxLength={100}
              autoComplete="given-name"
              required
            />
          </label>

          <label>
            Apellido
            <input
              name="apellido"
              value={form.apellido}
              onChange={change}
              maxLength={100}
              autoComplete="family-name"
              required
            />
          </label>

          <label>
            CI
            <input
              name="ci"
              value={form.ci}
              onChange={change}
              inputMode="numeric"
              maxLength={20}
              required
            />
          </label>

          <label>
            Teléfono
            <input
              name="telefono"
              type="tel"
              value={form.telefono}
              onChange={change}
              inputMode="tel"
              maxLength={30}
              autoComplete="tel"
              placeholder="Ej. 71234567"
            />
          </label>

          <label className="full-span">
            Correo electrónico
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={change}
              maxLength={150}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Contraseña
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={change}
                maxLength={72}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(v => !v)}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <label>
            Confirmar contraseña
            <div className="password-field">
              <input
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={change}
                maxLength={72}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm(v => !v)}
                title={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <div className="password-help full-span">
            8 caracteres mínimo · una mayúscula · una minúscula · un número
          </div>

          {error && (
            <div className="alert error full-span">
              {error}
            </div>
          )}

          {message && (
            <div className="alert success full-span">
              {message}
            </div>
          )}

          <button
            className="primary-button full-span"
            disabled={loading}
          >
            {loading ? 'Creando...' : 'Crear cuenta'}
          </button>

          <button
            type="button"
            className="secondary-button full-span"
            onClick={() => navigate('/login', { state: location.state })}
          >
            Volver al login
          </button>

        </form>
      </div>
    </div>
  );
}
