const CACHE_NAME = 'huellitas-shell-v3';

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/huellitas-icon.svg'
];

// INSTALACIÓN
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );

  self.skipWaiting();
});

// ACTIVACIÓN
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

// CACHÉ Y FUNCIONAMIENTO SIN CONEXIÓN
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
