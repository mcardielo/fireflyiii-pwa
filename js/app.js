(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    /**
     * Registrar el Service Worker lo antes posible.
     * No esperamos ni DOMReady ni window.load — queremos que el SW
     * esté listo para interceptar navegaciones y servir desde caché.
     */
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Worker no compatible con este navegador.');
            return;
        }

        navigator.serviceWorker.register('sw.js')
            .then(function(registration) {
                console.log('✅ Service Worker registrado:', registration.scope);

                // Auto-actualizar cuando haya nueva versión
                registration.addEventListener('updatefound', function() {
                    var newWorker = registration.installing;
                    newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🔄 Nueva versión disponible. Actualizando...');
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            // Recarga suave: no forzar, el SW tomará control en próxima navegación
                            setTimeout(function() { window.location.reload(); }, 500);
                        }
                    });
                });
            })
            .catch(function(error) {
                console.error('❌ Fallo al registrar Service Worker:', error);
            });
    }

    /**
     * Detectar cambios en conectividad y propagarlos a la UI.
     */
    function setupConnectivityListeners() {
        if (!window.FFPWA) window.FFPWA = {};

        window.addEventListener('online', function() {
            console.log('🌐 Conexión restablecida.');
            window.FFPWA.updateStatus && window.FFPWA.updateStatus('online');
        });

        window.addEventListener('offline', function() {
            console.log('📡 Sin conexión. Usando caché local.');
            window.FFPWA.updateStatus && window.FFPWA.updateStatus('offline');
        });
    }

    /**
     * Actualiza el badge de estado online/offline en todas las pantallas.
     */
    window.FFPWA.updateStatus = function(state) {
        function t(key, fallback) {
            if (typeof window.__ === 'function') {
                var val = window.__(key);
                return val !== key ? val : fallback;
            }
            return fallback;
        }

        var $badges = $('.online-status');
        if (state === 'offline') {
            $badges
                .removeClass('text-[#34c759] bg-[#e8f8ee]')
                .addClass('text-[#ff9500] bg-[#fff4e5]')
                .text(t('nav.offline', '● Offline'));
        } else {
            $badges
                .removeClass('text-[#ff9500] bg-[#fff4e5]')
                .addClass('text-[#34c759] bg-[#e8f8ee]')
                .text(t('nav.online', '● Online'));
        }
    };

    // Registrar SW inmediatamente (no esperar DOMReady)
    registerServiceWorker();
    setupConnectivityListeners();

    // Inicializar app cuando DOM esté listo (depende de jQuery)
    function initializeApp() {
        console.log('Inicializando PWA de Registro de Transacciones...');
        // Mark initial online status
        window.FFPWA.updateStatus && window.FFPWA.updateStatus(
            navigator.onLine ? 'online' : 'offline'
        );
    }

    // Usar DOMContentLoaded nativo por si jQuery no ha cargado aún
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Si jQuery ya cargó, usar el ready normal
            if (typeof $ !== 'undefined') {
                $(initializeApp);
            } else {
                // Fallback: inicializar manualmente
                setTimeout(initializeApp, 100);
            }
        });
    } else {
        initializeApp();
    }

})();
