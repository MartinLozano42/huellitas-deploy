import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, PawPrint, QrCode, Home, PlusCircle, ScanLine, FileWarning, MessageCircle, Bell, Image as ImageIcon, ArrowRight, Heart, ShieldCheck } from 'lucide-react';
import api, { mediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const links = [
  { to: '/usuario', label: 'Inicio', icon: Home, end: true },
  { to: '/usuario/mascotas', label: 'Mis mascotas', icon: PawPrint },
  { to: '/usuario/afiches', label: 'Crear afiche perdido', icon: ImageIcon },
  { to: '/usuario/mascotas/nueva', label: 'Registrar mascota', icon: PlusCircle },
  { to: '/usuario/qr', label: 'Mis QR', icon: QrCode },
  { to: '/usuario/leer-qr', label: 'Leer QR', icon: ScanLine },
  { to: '/usuario/reportar', label: 'Reportar pérdida/hallazgo', icon: PlusCircle },
  { to: '/usuario/reportes', label: 'Avisos y mis reportes', icon: FileWarning },
  { to: '/usuario/chat', label: 'Chat seguro', icon: MessageCircle },
  { to: '/usuario/notificaciones', label: 'Notificaciones', icon: Bell },
];

function readUser() {
  try { return JSON.parse(localStorage.getItem('prm_user') || '{}'); } catch { return {}; }
}

export default function UserHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = readUser();
  const [pets, setPets] = useState([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState('');

  useEffect(() => {
    if (location.pathname !== '/usuario') return;
    let active = true;
    api.get('/user/mascotas').then(({ data }) => { if (active) { setPets(Array.isArray(data) ? data : []); setHomeError(''); } })
      .catch((error) => { if (active) setHomeError(error.response?.data?.message || 'No se pudo cargar el resumen de tus mascotas.'); })
      .finally(() => { if (active) setHomeLoading(false); });
    return () => { active = false; };
  }, [location.pathname]);

  function logout() {
    localStorage.removeItem('prm_token');
    localStorage.removeItem('prm_user');
    navigate('/login', { replace: true });
  }

  return (
    <div className="user-shell">
      <header className="user-header">
        <div className="user-brand"><div className="brand-mark"><PawPrint size={22} /></div><div><strong>HUELLITAS</strong><span>Área de usuario</span></div></div>
        <div className="user-header-right"><span>{user.nombre || 'Usuario'}</span><button className="icon-button" title="Cerrar sesión" onClick={logout}><LogOut size={17} /></button></div>
      </header>

      <div className="user-layout">
        <aside className="user-nav">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `user-nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </aside>

        <main className="user-content">
          {location.pathname === '/usuario' ? (
            <div className="home-dashboard">
              <section className="home-hero">
                <div className="home-hero-copy"><span className="topbar-eyebrow">TU ESPACIO HUELLITAS</span><h1>Hola, {user.nombre || 'amigo'} 🐾</h1><p>Todo lo importante de tus compañeros, en un solo lugar. Mantén sus datos y su identificación al día.</p><div className="home-hero-actions"><button className="home-hero-button" onClick={() => navigate('/usuario/mascotas/nueva')}><PlusCircle size={17}/>Registrar mascota</button><button className="home-hero-link" onClick={() => navigate('/usuario/reportar')}><FileWarning size={17}/>Reportar un caso</button></div></div>
                <div className="home-hero-art"><div className="home-paw-orbit"><PawPrint size={76}/></div><span>Más cerca, más seguros</span></div>
              </section>
              {homeError && <div className="alert error">{homeError}</div>}
              <section className="home-stat-grid">
                <article className="home-stat-card"><span className="home-stat-icon"><PawPrint size={20}/></span><div><strong>{homeLoading ? '—' : pets.length}</strong><span>Mascotas registradas</span></div></article>
                <article className="home-stat-card"><span className="home-stat-icon mint"><ShieldCheck size={20}/></span><div><strong>{homeLoading ? '—' : pets.filter((p) => String(p.estado || '').toUpperCase() === 'EN_CASA').length}</strong><span>En casa</span></div></article>
                <article className="home-stat-card"><span className="home-stat-icon amber"><Heart size={20}/></span><div><strong>{homeLoading ? '—' : pets.filter((p) => String(p.estado || '').toUpperCase() === 'PERDIDA').length}</strong><span>Reportadas perdidas</span></div></article>
              </section>
              <section className="home-section-head"><div><h2>Mis compañeros</h2><p>Un vistazo rápido a tus mascotas registradas.</p></div><button className="home-text-link" onClick={() => navigate('/usuario/mascotas')}>Ver todas <ArrowRight size={16}/></button></section>
              {homeLoading ? <div className="home-empty-card">Cargando tus mascotas…</div> : pets.length ? <div className="home-pet-strip">{pets.slice(0,3).map((pet) => <article className="home-pet-mini" key={pet.id}><div className="home-pet-photo">{pet.foto ? <img src={mediaUrl(pet.foto)} alt={pet.nombre} onError={(e) => { e.currentTarget.style.display = 'none'; }}/> : <PawPrint size={25}/>}</div><div className="home-pet-info"><strong>{pet.nombre}</strong><span>{pet.especie} · {pet.raza || 'Sin raza'}</span><StatusBadge value={pet.estado}/></div><button className="home-pet-open" title={`Ver ${pet.nombre}`} onClick={() => navigate(`/usuario/mascotas/${pet.id}`)}><ArrowRight size={17}/></button></article>)}</div> : <div className="home-empty-card"><span className="home-empty-icon"><PawPrint size={28}/></span><div><h3>Tu primera huellita empieza aquí</h3><p>Registra a tu mascota para guardar sus datos, solicitar su QR y tenerla identificada.</p><button className="primary-button" onClick={() => navigate('/usuario/mascotas/nueva')}><PlusCircle size={16}/>Registrar mi primera mascota</button></div></div>}
              <section className="home-section-head home-shortcuts-heading"><div><h2>Accesos rápidos</h2><p>Herramientas útiles cuando las necesites.</p></div></section>
              <div className="home-shortcuts">
                <button onClick={() => navigate('/usuario/qr')}><span><QrCode size={21}/></span><strong>Mis códigos QR</strong><small>Identificación de tus mascotas</small><ArrowRight size={16}/></button>
                <button onClick={() => navigate('/usuario/afiches')}><span><ImageIcon size={21}/></span><strong>Crear un afiche</strong><small>Prepara un aviso de mascota perdida</small><ArrowRight size={16}/></button>
                <button onClick={() => navigate('/usuario/chat')}><span><MessageCircle size={21}/></span><strong>Chat seguro</strong><small>Comunícate dentro de Huellitas</small><ArrowRight size={16}/></button>
                <button onClick={() => navigate('/usuario/notificaciones')}><span><Bell size={21}/></span><strong>Notificaciones</strong><small>Revisa tus avisos y novedades</small><ArrowRight size={16}/></button>
              </div>
              <div className="home-tip"><ShieldCheck size={20}/><p><strong>Un consejo:</strong> mantén actualizada la fotografía y la información de contacto de tus mascotas. Puede ayudar mucho si alguien las encuentra.</p></div>
            </div>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
}
