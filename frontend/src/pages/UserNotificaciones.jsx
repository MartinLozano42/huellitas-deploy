import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  MessageCircle,
  PawPrint,
  RefreshCw
} from 'lucide-react';
import api from '../api.js';

function formatDate(value) {
  if (!value) return 'Fecha no disponible';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export default function UserNotificaciones() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState('TODAS');

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);

    try {
      const { data } = await api.get('/user/notificaciones');

      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(Number(data.no_leidas || 0));
      setError('');
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudieron cargar las notificaciones.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);

    const interval = window.setInterval(() => {
      load(false);
    }, 20000);

    const refresh = () => load(false);

    window.addEventListener('focus', refresh);
    window.addEventListener('huellitas:communication-updated', refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(
        'huellitas:communication-updated',
        refresh
      );
    };
  }, [load]);

  const filteredItems = items.filter((item) => {
    if (filter === 'NO_LEIDAS') {
      return !Boolean(item.leida);
    }

    if (filter === 'LEIDAS') {
      return Boolean(item.leida);
    }

    return true;
  });

  async function markRead(id) {
    if (updatingId === id) return;

    const notification = items.find(
      (item) => Number(item.id) === Number(id)
    );

    if (!notification || Boolean(notification.leida)) return;

    setUpdatingId(id);
    setError('');

    try {
      await api.patch(`/user/notificaciones/${id}/leida`);

      setItems((current) =>
        current.map((item) =>
          Number(item.id) === Number(id)
            ? { ...item, leida: 1 }
            : item
        )
      );

      setUnread((current) => Math.max(0, current - 1));

      window.dispatchEvent(
        new Event('huellitas:communication-updated')
      );
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo actualizar la notificación.'
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function markAll() {
    if (unread === 0 || markingAll) return;

    setMarkingAll(true);
    setError('');

    try {
      await api.patch('/user/notificaciones/leidas/todas');

      setItems((current) =>
        current.map((item) => ({
          ...item,
          leida: 1
        }))
      );

      setUnread(0);

      window.dispatchEvent(
        new Event('huellitas:communication-updated')
      );
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudieron actualizar las notificaciones.'
      );
    } finally {
      setMarkingAll(false);
    }
  }

  async function openNotification(item) {
    if (!item.leida) {
      await markRead(item.id);
    }

    const type = String(item.tipo || '').toUpperCase();

    if (type.includes('CHAT')) {
      navigate('/usuario/chat');
      return;
    }

    navigate('/usuario/reportes');
  }

  function getNotificationIcon(item) {
    const type = String(item.tipo || '').toUpperCase();

    if (type.includes('CHAT')) {
      return <MessageCircle size={20} />;
    }

    return <PawPrint size={20} />;
  }

  function getNotificationLabel(item) {
    const type = String(item.tipo || '').toUpperCase();

    if (type.includes('CHAT')) {
      return 'Mensaje';
    }

    if (type.includes('REPORTE')) {
      return 'Reporte de mascota';
    }

    if (type.includes('AVISTAMIENTO')) {
      return 'Avistamiento';
    }

    if (type.includes('ENCONTRADA')) {
      return 'Mascota encontrada';
    }

    return 'Aviso de Huellitas';
  }

  return (
    <div className="notifications-container">

      <div className="page-header">
        <div>
          <h1>Notificaciones</h1>
          <p>
            Aquí encontrarás los avisos y novedades relacionados
            con tus mascotas y tu cuenta.
          </p>
        </div>

        <div className="notification-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => load(true)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>

          {unread > 0 && (
            <button
              type="button"
              className="secondary-button"
              onClick={markAll}
              disabled={markingAll}
            >
              <CheckCheck size={16} />
              {markingAll
                ? 'Actualizando…'
                : 'Marcar todas como leídas'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert error">
          {error}
        </div>
      )}

      <section className="notification-page-summary panel">
        <div className="notification-summary-icon">
          <Bell size={23} />
        </div>

        <div>
          <strong>
            {unread} {unread === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}
          </strong>

          <span>
            Las notificaciones se actualizan automáticamente
            cada 20 segundos.
          </span>
        </div>
      </section>

      <div className="notification-filters panel">
        <button
          type="button"
          className={filter === 'TODAS' ? 'selected' : ''}
          onClick={() => setFilter('TODAS')}
        >
          Todas
          <span>{items.length}</span>
        </button>

        <button
          type="button"
          className={filter === 'NO_LEIDAS' ? 'selected' : ''}
          onClick={() => setFilter('NO_LEIDAS')}
        >
          Sin leer
          <span>{unread}</span>
        </button>

        <button
          type="button"
          className={filter === 'LEIDAS' ? 'selected' : ''}
          onClick={() => setFilter('LEIDAS')}
        >
          Leídas
          <span>{items.length - unread}</span>
        </button>
      </div>

      {loading ? (
        <div className="loading">
          Cargando notificaciones…
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state panel">
          <Bell size={38} />

          <p>
            {filter === 'NO_LEIDAS'
              ? 'No tienes notificaciones pendientes.'
              : filter === 'LEIDAS'
                ? 'Todavía no tienes notificaciones leídas.'
                : 'Aún no tienes notificaciones.'}
          </p>

          {filter !== 'TODAS' && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setFilter('TODAS')}
            >
              Ver todas
            </button>
          )}
        </div>
      ) : (
        <div className="notification-page-list">

          {filteredItems.map((item) => {
            const isUnread = !Boolean(item.leida);

            return (
              <article
                className={`notification-page-item panel ${
                  isUnread ? 'unread' : ''
                }`}
                key={item.id}
              >
                <div className="notification-page-icon">
                  {getNotificationIcon(item)}
                </div>

                <div className="notification-page-copy">
                  <div className="notification-item-heading">
                    <strong>{item.titulo}</strong>

                    {isUnread && (
                      <span className="notification-unread-indicator">
                        Nueva
                      </span>
                    )}
                  </div>

                  <span className="notification-item-type">
                    {getNotificationLabel(item)}
                  </span>

                  <p>{item.mensaje}</p>

                  <small>
                    {formatDate(item.fecha)}
                  </small>
                </div>

                <div className="notification-page-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => openNotification(item)}
                  >
                    Abrir
                  </button>

                  {isUnread && (
                    <button
                      type="button"
                      className="link-button"
                      disabled={updatingId === item.id}
                      onClick={() => markRead(item.id)}
                    >
                      {updatingId === item.id
                        ? 'Guardando…'
                        : 'Marcar leída'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

        </div>
      )}
    </div>
  );
}
