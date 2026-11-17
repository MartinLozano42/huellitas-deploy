const CACHE_NAME = 'huellitas-shell-v2';

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/huellitas-icon.svg'
];

// ==========================================
// INSTALACIÓN
// ==========================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );

  self.skipWaiting();
});

// ==========================================
// ACTIVACIÓN
// ==========================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// ==========================================
// RECEPCIÓN DE NOTIFICACIONES PUSH
// ==========================================

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    try {
      payload = {
        body: event.data?.text() || 'Tienes una novedad en Huellitas.'
      };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || 'Huellitas 🐾';

  const options = {
    body: payload.body || 'Tienes una nueva notificación.',
    icon: '/huellitas-icon.svg',
    badge: '/huellitas-icon.svg',
    tag: payload.tag || 'huellitas-notification',
    renotify: Boolean(payload.renotify),
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: {
      url: payload.url || '/usuario/notificaciones',
      notificationId: payload.notificationId || null,
      type: payload.type || 'GENERAL'
    },
    actions: [
      {
        action: 'open',
        title: 'Ver notificación'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ==========================================
// CLIC EN UNA NOTIFICACIÓN
// ==========================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;

  if (action && action !== 'open') {
    return;
  }

  const targetUrl = new URL(
    event.notification.data?.url || '/usuario/notificaciones',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(async (clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ==========================================
// CERRAR NOTIFICACIÓN
// ==========================================

self.addEventListener('notificationclose', () => {
  // El usuario cerró la notificación.
});

// ==========================================
// CACHÉ Y FUNCIONAMIENTO SIN CONEXIÓN
// ==========================================

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (
            request.mode === 'navigate' ||
            url.pathname.startsWith('/assets/')
          )
        ) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }

        return response;
      })
      .catch(async () => {
        return (
          await caches.match(request) ||
          (
            request.mode === 'navigate'
              ? caches.match('/')
              : Response.error()
          )
        );
      })
  );
});
