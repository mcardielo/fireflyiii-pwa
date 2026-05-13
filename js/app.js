(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    function initializeApp() {
        console.log('Inicializando PWA de Registro de Transacciones...');

        // Registrar el Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('✅ Service Worker registrado:', registration.scope);

                        // Si hay una nueva versión del SW, instalarla inmediatamente
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('🔄 Nueva versión disponible. Actualizando...');
                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                    window.location.reload();
                                }
                            });
                        });
                    })
                    .catch((error) => {
                        console.error('❌ Fallo al registrar Service Worker:', error);
                    });
            });
        } else {
            console.warn('⚠️ Service Worker no compatible con este navegador.');
        }
    }

    $(document).ready(function() {
        initializeApp();
    });

})();
