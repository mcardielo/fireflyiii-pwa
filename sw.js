const CACHE_NAME = 'firefly-pwa-v2.1';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'js/config.js',
    'js/accounts.js',
    'js/currencies.js',
    'js/transactions.js',
    'js/app.js',
    'manifest.json'
];

/**
 * Estrategia Cache First para HTML: sirve desde caché al instante,
 * y actualiza en background cuando la red responde.
 * Así la PWA nunca espera por la red al abrirse o reanudarse.
 */
async function cacheFirstWithNetworkUpdate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    // Actualizar caché en background (sin bloquear)
    const updateCache = fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => null);

    if (cachedResponse) {
        // Servir caché inmediato, actualizar en background
        return cachedResponse;
    }

    // Sin caché: esperar la red
    return updateCache;
}

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando: Cacheando assets estáticos.');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Cache abierto. Cacheando assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((error) => {
                console.error('Fallo al cachear assets:', error);
            })
    );

    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activando: Limpiando cachés antiguas.');
    const cacheWhitelist = [CACHE_NAME];

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheWhitelist.indexOf(cacheName) === -1) {
                            console.log(`[Service Worker] Eliminando caché antigua: ${cacheName}`);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Las peticiones a la API de Firefly III siempre van por red (sin cachear)
    if (requestUrl.pathname.startsWith('/api/v1')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // HTML: Cache First — sirve al instante desde caché, actualiza en background
    if (requestUrl.pathname.endsWith('/') || requestUrl.pathname.endsWith('.html')) {
        event.respondWith(cacheFirstWithNetworkUpdate(event.request));
        return;
    }

    // Assets estáticos (JS, CSS, etc): Cache First
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request);
            })
            .catch((error) => {
                console.error('[Service Worker] Fallo al cargar recurso:', error);
                return new Response('Error al cargar recurso', { status: 502 });
            })
    );
});

/**
 * Background Sync: cuando el SW recibe un evento sync, 
 * notifica a todas las páginas cliente para que ejecuten syncQueue().
 * La página se encarga de leer la cola desde localStorage.
 */
self.addEventListener('sync', (event) => {
    console.log(`[Service Worker] Sync event recibido: "${event.tag}"`);

    if (event.tag === 'sync-transactions') {
        event.waitUntil(
            self.clients.matchAll({ includeUncontrolled: true })
                .then((clients) => {
                    if (clients.length === 0) {
                        console.log('[Service Worker] No hay clientes para notificar.');
                        return;
                    }
                    const promises = clients.map(client => {
                        return client.postMessage({
                            type: 'BACKGROUND_SYNC',
                            tag: event.tag
                        });
                    });
                    return Promise.all(promises);
                })
                .then(() => {
                    console.log('[Service Worker] Notificación de sync enviada a todos los clientes.');
                })
                .catch((err) => {
                    console.error('[Service Worker] Error notificando a clientes:', err);
                })
        );
    }
});

/**
 * Mensajes desde la página (cliente)
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
