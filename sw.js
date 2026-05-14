const CACHE_NAME = 'firefly-pwa-v2.0';
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
 * Estrategia Network First para HTML: intenta red primero, 
 * fallback a caché si está offline. Así el usuario siempre ve
 * la última versión cuando tiene conexión.
 */
async function networkFirstWithCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        throw new Error('Respuesta de red no ok');
    } catch (err) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return new Response('Recurso no disponible offline', { status: 503 });
    }
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

    // HTML: Network First (funciona en cualquier subpath, incluyendo GitHub Pages)
    if (requestUrl.pathname.endsWith('/') || requestUrl.pathname.endsWith('.html')) {
        event.respondWith(networkFirstWithCache(event.request));
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
