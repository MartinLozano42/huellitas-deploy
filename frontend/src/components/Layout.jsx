import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import api from '../api.js';
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  LogOut,
  QrCode,
  Users,
  PawPrint,
  FileWarning,
  Check,
  X,
} from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/usuarios', label: 'Usuarios', icon: Users, badgeKey: 'usuarios' },
  { to: '/mascotas', label: 'Mascotas', icon: PawPrint },
  { to: '/qr', label: 'Identificaciones QR', icon: QrCode, badgeKey: 'qr' },
  { to: '/reportes?vista=casos', label: 'Casos', icon: FileWarning },
  { to: '/reportes?vista=estadisticas', label: 'Estadísticas', icon: BarChart3 },
];

function displayUser() {
  try {
    return JSON.parse(localStorage.getItem('prm_user') || '{}');
  } catch {
    return {};
  }
}

function linkIsActive(pathname, search, to) {
  if (to === '/') return pathname === '/';

  const [targetPath, targetSearch] = to.split('?');

  if (pathname !== targetPath) return false;

  if (!targetSearch) return true;

  return search === `?${targetSearch}`;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = displayUser();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState('');
  const [requestCounts, setRequestCounts] = useState({ usuariosPendientes: 0, qrPendientes: 0, retirosPendientes: 0 });
  const notificationsRef = useRef(null);

  async function loadNotifications() {
    try { const { data } = await api.get('/admin/notificaciones'); setNotifications(data); setNotificationsError(''); }
    catch (e) { setNotificationsError(e.response?.data?.message || 'No se pudieron cargar las notificaciones.'); }
  }

  async function loadRequestCounts() {
    try {
      const { data } = await api.get('/admin/resumen-solicitudes');
      setRequestCounts({
        usuariosPendientes: Number(data.usuariosPendientes || 0),
        qrPendientes: Number(data.qrPendientes || 0),
        retirosPendientes: Number(data.retirosPendientes || 0)
      });
    } catch {
      // Si falla el resumen, no bloqueamos la navegación del panel.
    }
  }

  useEffect(() => {
    loadNotifications();
    loadRequestCounts();
    const refreshAll = () => { loadRequestCounts(); loadNotifications(); };
    const interval = window.setInterval(refreshAll, 20000);
    const refreshWhenFocused = () => { refreshAll(); };
    const refreshAfterMutation = () => { loadRequestCounts(); loadNotifications(); };
    window.addEventListener('focus', refreshWhenFocused);
    window.addEventListener('huellitas:solicitudes-updated', refreshAfterMutation);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenFocused);
      window.removeEventListener('huellitas:solicitudes-updated', refreshAfterMutation);
    };
  }, []);

  useEffect(() => { loadRequestCounts(); }, [location.pathname]);

  useEffect(() => {
    function closeOutside(event) { if (notificationsRef.current && !notificationsRef.current.contains(event.target)) setNotificationsOpen(false); }
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, []);

  async function markNotificationRead(id) {
    try { await api.patch(`/admin/notificaciones/${id}/leida`); setNotifications(current => current.map(n => n.id === id ? { ...n, leida: 1 } : n)); }
    catch (e) { setNotificationsError(e.response?.data?.message || 'No se pudo marcar como leída.'); }
  }

  function logout() {
    localStorage.removeItem('prm_token');
    localStorage.removeItem('prm_user');
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <PawPrint size={22} />
          </div>

          <div>
            <strong>Huellitas</strong>
            <span>Admin</span>
          </div>
        </div>

        <nav className="nav-list">
          {links.map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badgeKey === 'usuarios'
              ? requestCounts.usuariosPendientes
              : item.badgeKey === 'qr'
                ? requestCounts.qrPendientes + requestCounts.retirosPendientes
                : 0;
            const badgeTitle = item.badgeKey === 'usuarios'
              ? `${requestCounts.usuariosPendientes} usuarios por revisar`
              : item.badgeKey === 'qr'
                ? `${requestCounts.qrPendientes} solicitudes QR por aprobar y ${requestCounts.retirosPendientes} retiros por atender`
                : '';

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={badgeTitle || undefined}
                className={() =>
                  `nav-item ${
                    linkIsActive(location.pathname, location.search, item.to)
                      ? 'active'
                      : ''
                  }`
                }
              >
                <Icon size={18} />
                <span className="nav-item-label">{item.label}</span>
                {badgeCount > 0 && <span className="nav-badge" aria-label={`${badgeCount} solicitudes pendientes`}>{badgeCount > 99 ? '99+' : badgeCount}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="admin-mini">
            <div className="avatar">
              {(user.nombre || 'A').slice(0, 1).toUpperCase()}
            </div>

            <div className="admin-mini-copy">
              <strong>
                {user.nombre || 'Admin'} {user.apellido || ''}
              </strong>
              <span>Administrador</span>
            </div>
          </div>

          <button
            className="nav-item logout-button"
            type="button"
            onClick={logout}
          >
            <LogOut size={18} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="topbar-eyebrow">Panel de control</div>
            <div className="topbar-title">Gestión de Huellitas</div>
          </div>

          <div className="topbar-actions">
            <div className="notification-anchor" ref={notificationsRef}>
              <button className="icon-button notification-bell" type="button" title="Notificaciones" aria-label="Notificaciones" aria-expanded={notificationsOpen} onClick={() => { const next = !notificationsOpen; setNotificationsOpen(next); if (next) loadNotifications(); }}>
                <Bell size={19} />
                {notifications.some(n => !n.leida) && <span className="notification-count">{notifications.filter(n => !n.leida).length > 99 ? '99+' : notifications.filter(n => !n.leida).length}</span>}
              </button>
              {notificationsOpen && <div className="notification-popover">
                <div className="notification-popover-header"><div><strong>Notificaciones</strong><span>{notifications.filter(n => !n.leida).length} sin leer</span></div><button className="link-button" type="button" onClick={() => setNotificationsOpen(false)} aria-label="Cerrar"><X size={17}/></button></div>
                {notificationsError && <div className="notification-error">{notificationsError}</div>}
                {notifications.length === 0 ? <div className="notification-empty">No tienes notificaciones nuevas.</div> : <div className="notification-list">{notifications.map(n => <button type="button" key={n.id} className={`notification-item ${n.leida ? 'read' : 'unread'}`} onClick={() => { if (!n.leida) markNotificationRead(n.id); }}><span className="notification-item-title">{n.titulo}{!n.leida && <i/>}</span><span>{n.mensaje}</span><small>{new Date(n.fecha).toLocaleString('es-BO')}</small>{!n.leida && <span className="notification-mark"><Check size={13}/>Marcar leída</span>}</button>)}</div>}
              </div>}
            </div>
            <div className="user-chip">{user.nombre || 'Admin'}</div>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}