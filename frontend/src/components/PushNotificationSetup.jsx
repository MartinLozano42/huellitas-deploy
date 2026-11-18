import { useEffect, useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import api from '../api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((char) => char.charCodeAt(0))
  );
}

export default function PushNotificationSetup() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('checking');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('prm_token');

    if (!token || !window.location.pathname.startsWith('/usuario')) {
      return;
    }

    let active = true;

    async function checkStatus() {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        if (active) {
          setStatus('unsupported');
          setVisible(true);
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          await registration.pushManager.getSubscription();

        if (!active) return;

        if (Notification.permission === 'denied') {
          setStatus('denied');
          setVisible(true);
        } else if (subscription) {
          setStatus('enabled');
          setVisible(false);
        } else {
          setStatus('disabled');
          setVisible(true);
        }
      } catch (error) {
        console.error('[PUSH] Error comprobando dispositivo:', error);

        if (active) {
          setStatus('error');
          setVisible(true);
        }
      }
    }

    checkStatus();

    return () => {
      active = false;
    };
  }, []);

  async function enableNotifications() {
    setLoading(true);
    setMessage('');

    try {
      if (!window.isSecureContext) {
        throw new Error('Las notificaciones requieren una conexión HTTPS.');
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error('El navegador no admite Service Worker.');
      }

      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        setStatus('denied');
        throw new Error('No concediste permiso para las notificaciones.');
      }

      const response = await api.get('/user/push/public-key');
      const publicKey = response.data?.publicKey;

      if (!publicKey || publicKey.length !== 87) {
        throw new Error('La clave pública VAPID recibida no es válida.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      await navigator.serviceWorker.ready;

      let subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      await api.post('/user/push/subscribe', {
        subscription: subscription.toJSON()
      });

      setStatus('enabled');
      setVisible(false);
      setMessage('¡Notificaciones activadas correctamente!');

      console.log('[PUSH] Dispositivo registrado correctamente.');
    } catch (error) {
      console.error('[PUSH] Error activando notificaciones:', {
        name: error.name,
        message: error.message,
        status: error.response?.status,
        response: error.response?.data
      });

      setMessage(
        error.response?.data?.message ||
        error.message ||
        'No se pudieron activar las notificaciones.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function disableNotifications() {
    setLoading(true);
    setMessage('');

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.getSubscription();

      if (subscription) {
        await api.delete('/user/push/subscribe', {
          data: { endpoint: subscription.endpoint }
        });

        await subscription.unsubscribe();
      }

      setStatus('disabled');
      setVisible(true);
      setMessage('Notificaciones desactivadas.');
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
        'No se pudieron desactivar las notificaciones.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (!visible && status !== 'enabled') return null;

  if (status === 'enabled') {
    return (
      <div className="push-status-indicator">
        <BellRing size={16} />
        <span>Notificaciones activadas</span>
        <button
          type="button"
          onClick={disableNotifications}
          disabled={loading}
        >
          {loading ? '...' : 'Desactivar'}
        </button>
      </div>
    );
  }

  return (
    <section className="push-setup-card">
      <button
        type="button"
        className="push-setup-close"
        onClick={() => setVisible(false)}
        aria-label="Cerrar"
      >
        <X size={17} />
      </button>

      <div className="push-setup-icon">
        <BellRing size={23} />
      </div>

      <div className="push-setup-content">
        <strong>Activa tus notificaciones</strong>

        <p>
          Recibe avisos de Huellitas incluso cuando no estés
          navegando por la plataforma.
        </p>

        {status === 'denied' ? (
          <small>
            El permiso está bloqueado. Habilítalo desde los ajustes
            del navegador.
          </small>
        ) : status === 'unsupported' ? (
          <small>
            Tu navegador no admite notificaciones push.
          </small>
        ) : (
          <button
            type="button"
            onClick={enableNotifications}
            disabled={loading}
          >
            <Bell size={16} />
            {loading ? 'Activando...' : 'Activar notificaciones'}
          </button>
        )}

        {message && (
          <small className="push-setup-message">{message}</small>
        )}
      </div>
    </section>
  );
}
