const CACHE_NAME = 'firefly-pwa-v2.18';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'css/style.css',
    'js/config.js',
    'js/utils.js',
    'js/accounts.js',
    'js/currencies.js',
    'js/transactions.js',
    'js/accounts-screen.js',
    'js/transactions-history.js',
    'js/transaction-edit.js',
    'js/i18n.js',
    'js/icons.js',
    'js/darkmode.js',
    'js/auth.js',
    'js/app.js',
    'js/jquery-3.6.0.min.js',
    'lang/en.json',
    'lang/es.json',
    'manifest.json',
    'favicon.ico',
    'icons/favicon-16x16.png',
    'icons/favicon-32x32.png'
];

/**
 * Estrategia Cache First con fallback offline para HTML.
 *  1. Sirve desde caché al instante.
 *  2. Actualiza en background desde la red (si hay conexión).
 *  3. Si no hay caché ni red, devuelve index.html como fallback.
 */
async function cacheFirstWithNetworkUpdate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    const updateCache = fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => null);

    if (cachedResponse) {
        return cachedResponse;
    }

    // Sin caché: esperar la red
    try {
        return await updateCache;
    } catch (_) {
        // Sin red ni caché → fallback a index.html
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
        const fallback2 = await cache.match('index.html');
        if (fallback2) return fallback2;
        const fallback3 = await cache.match('./index.html');
        if (fallback3) return fallback3;
        throw new Error('No hay caché ni conexión');
    }
}

/**
 * Cachea una lista de recursos con tolerancia a fallos individuales.
 * Si un recurso falla, el resto se cachean igual.
 */
async function cacheAllTolerant(cache, assets) {
    const results = await Promise.allSettled(
        assets.map(url =>
            cache.add(url).catch(err => {
                console.warn('[SW] No se pudo cachear:', url, err.message);
            })
        )
    );
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        console.warn(`[SW] ${failed.length} recurso(s) no se pudieron cachear (pueden ser CDN con restricciones de CORS).`);
    }
}

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando: Cacheando assets estáticos + CDN.');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Cache abierto. Cacheando recursos...');
                return cacheAllTolerant(cache, ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[Service Worker] Todos los assets procesados.');
            })
            .catch((error) => {
                console.error('[Service Worker] Error en instalación:', error);
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

    // ── Firefly III API: siempre va por red ──
    if (requestUrl.pathname.startsWith('/api/v1')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(
                    JSON.stringify({ error: 'offline' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // ── Navegación (HTML): Cache First + fallback offline ──
    if (requestUrl.pathname.endsWith('/') || requestUrl.pathname.endsWith('.html')) {
        event.respondWith(cacheFirstWithNetworkUpdate(event.request));
        return;
    }

    // ── CDN y assets estáticos: Cache First ──
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).catch(() => {
                    // Si falla un recurso no cacheado (p.ej. una imagen no crítica),
                    // devolver 404 silencioso en vez de error fatal
                    return new Response(null, { status: 404 });
                });
            })
    );
});

/**
 * Background Sync
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

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
