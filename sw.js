const CACHE_NAME = 'firefly-pwa-v2.37';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'css/style.css',
    'js/http.js',
    'js/lookups.js',
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
    'lang/en.json',
    'lang/es.json',
    'manifest.json',
    'favicon.ico',
    'icons/favicon-16x16.png',
    'icons/favicon-32x32.png'
];

/**
 * Estrategia Cache First para navegación (HTML).
 *  1. Intenta servir index.html desde caché INMEDIATAMENTE (ignora query params).
 *  2. Si hay red, actualiza en background con timeout (no bloquea la respuesta).
 *  3. Sin caché ni red → fallback a cualquier index.html cacheado.
 */
async function cacheFirstNavigation(request) {
    const cache = await caches.open(CACHE_NAME);

    // Intentar match directo, luego index.html (ignorando query params)
    let cachedResponse = await cache.match(request, { ignoreSearch: true });
    if (!cachedResponse) {
        cachedResponse = await cache.match('index.html', { ignoreSearch: true });
    }
    if (!cachedResponse) {
        cachedResponse = await cache.match('./index.html', { ignoreSearch: true });
    }
    if (!cachedResponse) {
        cachedResponse = await cache.match('/index.html', { ignoreSearch: true });
    }

    if (cachedResponse) {
        // Actualizar en background con timeout de 8s (no bloquea la respuesta cacheada)
        fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
        }).catch(() => null);
        return cachedResponse;
    }

    // Sin caché: esperar red con timeout de 10s
    try {
        const networkResponse = await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);
        if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (_) {
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
        event.respondWith(cacheFirstNavigation(event.request));
        return;
    }

    // ── Assets estáticos: Cache First + timeout de red ──
    event.respondWith(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.match(event.request, { ignoreSearch: true })
                .then(function(cachedResponse) {
                    if (cachedResponse) {
                        // Actualizar en background (no bloquea)
                        fetch(event.request).then(function(networkResponse) {
                            if (networkResponse && networkResponse.ok) {
                                cache.put(event.request, networkResponse.clone());
                            }
                        }).catch(function() {});
                        return cachedResponse;
                    }
                    // Sin caché: fetch con timeout de 5s (no 30s default)
                    return Promise.race([
                        fetch(event.request),
                        new Promise(function(_, reject) {
                            setTimeout(function() { reject(new Error('asset-timeout')); }, 5000);
                        })
                    ]).then(function(networkResponse) {
                        if (networkResponse && networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(function() {
                        return new Response(null, { status: 404 });
                    });
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
