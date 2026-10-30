import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, PawPrint, ShieldCheck } from 'lucide-react';
import api from '../api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.removeItem('prm_token');
    localStorage.removeItem('prm_user');
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!password) {
      setError('Ingresa tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        email: normalizedEmail,
        password,
      });
      localStorage.setItem('prm_token', data.token);
      localStorage.setItem('prm_user', JSON.stringify(data.user));
      const requestedPath = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//')
        ? location.state.from : '';
      const destination = data.user.rol === 'ADMIN'
        ? (requestedPath.startsWith('/admin') || requestedPath === '/' || requestedPath.startsWith('/usuarios') || requestedPath.startsWith('/mascotas') || requestedPath.startsWith('/qr') || requestedPath.startsWith('/reportes') ? requestedPath : '/admin')
        : (requestedPath.startsWith('/usuario') ? requestedPath : '/usuario');
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-mark"><PawPrint size={28} /></div>
          <div><strong>HUELLITAS</strong><span>Acceso a Huellitas</span></div>
        </div>

        <div className="login-copy">
          <h1>Bienvenido de nuevo</h1>
          <p>{location.state?.notice || 'Ingresa con tu cuenta para acceder a Huellitas.'}</p>
        </div>

        <form onSubmit={submit} className="form-stack">
          <label>
            Correo electrónico
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="correo@ejemplo.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Contraseña
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary-button full" disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <button
            type="button"
            className="secondary-button full register-button"
            onClick={() => navigate('/register', { state: location.state })}
          >
            Crear una cuenta
          </button>
        </form>

        <div className="login-note">
          <ShieldCheck size={18} />
          <span>Tu acceso está protegido por autenticación segura.</span>
        </div>
      </div>
    </div>
  );
}
