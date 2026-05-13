(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.config = {
        url: null,
        token: null
    };

    /**
     * Gestiona el envío del formulario de configuración.
     */
    function handleConfigSubmit(e) {
        e.preventDefault();

        const url = $('#firefly-url').val().trim();
        const token = $('#personal-token').val().trim();
        const messageArea = $('#config-message');

        if (!url || !token) {
            messageArea.removeClass('text-green-600 text-red-600').addClass('text-red-600');
            messageArea.text('Por favor, rellena ambos campos.');
            return;
        }

        // Validar URL básica
        try {
            new URL(url);
        } catch (_) {
            messageArea.removeClass('text-green-600 text-red-600').addClass('text-red-600');
            messageArea.text('❌ La URL no es válida. Debe incluir https://');
            return;
        }

        messageArea.removeClass('text-green-600 text-red-600').addClass('text-indigo-600').text('Validando credenciales...');
        $('#config-form button').prop('disabled', true);

        $.ajax({
            url: `${url}/api/v1/about`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            dataType: 'json',
            success: function() {
                messageArea.removeClass('text-indigo-600').addClass('text-green-600');
                messageArea.text('✅ ¡Conexión exitosa! Redirigiendo...');

                const cleanUrl = url.replace(/\/$/, '');

                // Guardar configuración
                // NOTA: El token se almacena en localStorage para funcionar offline.
                // Esto es inseguro si alguien más accede al navegador.
                // Considera usar un proxy backend si la seguridad es crítica.
                localStorage.setItem('FIREFLY_URL', cleanUrl);
                localStorage.setItem('FIREFLY_TOKEN', token);

                window.FFPWA.config.url = cleanUrl;
                window.FFPWA.config.token = token;

                $('#setup-container').addClass('hidden');
                $('#dashboard-container').removeClass('hidden');

                $(window).trigger('configLoaded');
            },
            error: function(xhr) {
                let errorMessage = '';
                if (xhr.status === 401) {
                    errorMessage = '❌ Token inválido. Verifica tu Token de Acceso Personal.';
                } else if (xhr.status === 403) {
                    errorMessage = '❌ Permiso denegado. El token necesita permisos de lectura y escritura.';
                } else if (xhr.status === 0) {
                    errorMessage = '❌ Fallo de conexión. Revisa la URL y tu conexión a internet.';
                } else {
                    errorMessage = `❌ Error en la API (Status: ${xhr.status}). Revisa URL o token.`;
                }

                messageArea.removeClass('text-indigo-600').addClass('text-red-600');
                messageArea.text(errorMessage);
            },
            complete: function() {
                $('#config-form button').prop('disabled', false);
            }
        });
    }

    /**
     * Determina el estado inicial de la aplicación.
     */
    function checkConfiguration() {
        const storedUrl = localStorage.getItem('FIREFLY_URL');
        const storedToken = localStorage.getItem('FIREFLY_TOKEN');

        if (!storedUrl || !storedToken) {
            console.log('Configuración no encontrada. Mostrando pantalla de setup.');
            $('#setup-container').removeClass('hidden');
            $('#dashboard-container').addClass('hidden');
            $('#config-form').on('submit', handleConfigSubmit);
            return false;
        }

        console.log('Configuración encontrada.');

        window.FFPWA.config.url = storedUrl;
        window.FFPWA.config.token = storedToken;

        $('#setup-container').addClass('hidden');
        $('#dashboard-container').removeClass('hidden');

        return true;
    }

    $(document).ready(function() {
        const isConfigured = checkConfiguration();

        if (isConfigured) {
            console.log('App lista. Cargando cuentas...');
            $(window).trigger('configLoaded');
        }
    });

})();
