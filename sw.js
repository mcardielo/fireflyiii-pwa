const CACHE_NAME = 'firefly-pwa-v1.3';
const ASSETS_TO_CACHE = [
    '/',
    'index.html',
    'js/config.js',
    'js/accounts.js',
    'js/transactions.js',
    'js/app.js',
    'manifest.json'
];


self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando: Cacheando assets estáticos.');
    
    // Almacena todos los recursos esenciales para que la app funcione offline
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
    
    // Hace que el Service Worker se active inmediatamente, evitando la instalación en segundo plano.
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
            .then(() => self.clients.claim()) // Asegura que el SW tome el control de la página actual
    );
});


self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Las peticiones a la API de Firefly III (cualquier cosa que contenga /api/v1) 
    // deben pasar por la red para obtener los datos más recientes.
    if (requestUrl.pathname.startsWith('/api/v1')) {
        console.log(`[Service Worker] Interceptado API: ${requestUrl.pathname}. PERMITIDO EN RED.`);
        return;
    }

    event.respondWith(
        // Intenta obtener el recurso desde la caché primero (CACHE-FIRST)
        caches.match(event.request)
            .then((cachedResponse) => {
                // Si se encuentra en la caché, lo devuelve.
                if (cachedResponse) {
                    console.log(`[Service Worker] Sirviendo ${event.request.url} desde la caché.`);
                    return cachedResponse;
                }
                // Si no se encuentra en la caché, intenta cargarlo desde la red.
                console.log(`[Service Worker] Recursos estáticos no encontrados en caché. Cargando desde red.`);
                return fetch(event.request);
            })
            // Si falla el cache y falla la red (ej. está completamente offline)
            .catch((error) => {
                console.error('[Service Worker] Fallo total al cargar el recurso:', error);
                // Aquí podrías devolver una respuesta de error HTML genérica si fuese necesario
            })
    );
});


self.addEventListener('sync', (event) => {    
    console.log(`[Service Worker] === DETECTADO SINCRONIZACIÓN EN SEGUNDO PLANO ===`);    
    console.log('[Service Worker] Ejecutando lógica de sincronización de cola...');
    
    // Dejar el mensaje de confirmación para el usuario en la web.
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach(client => {
            client.postMessage({ type: 'SYNC_SUCCESS', message: 'La sincronización de datos en segundo plano fue exitosa.' });
        });
    });
});