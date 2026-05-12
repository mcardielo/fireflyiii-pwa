/**
 * Función principal de inicialización de la aplicación.
 * Se llama automáticamente cuando el DOM está listo.
 */
function initializeApp() {
    console.log('Inicializando PWA de Registro de Transacciones...');

    // Registrar el Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('✅ Service Worker registrado con éxito:', registration.scope);
                })
                .catch((error) => {
                    console.error('❌ Fallo al registrar Service Worker:', error);
                });
        });
    } else {
        console.warn('⚠️ Service Worker no es compatible con este navegador.');
    }
}


/**
 * Listener Global de Configuración:
 * Este evento se dispara desde 'config.js' una vez que la URL y el token
 * han sido guardados en localStorage y el usuario ha sido redirigido al dashboard.
 */
$(window).on('configLoaded', function() {
    console.log('Configuración Completada.');
    
    // Si hay cuentas en caché al cargar la app, las inicializamos.
    if (localStorage.getItem('firefly_accounts_cache')) {
        console.log('App inicializada usando caché de cuentas.');
    }
});

$(document).ready(function() {
    initializeApp(); 
});