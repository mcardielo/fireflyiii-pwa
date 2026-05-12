/**
 * Función que gestiona el envío del formulario de configuración.
 * @param {Event} e - El evento de envío del formulario.
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

    // Mostrar estado de carga
    messageArea.removeClass('text-green-600 text-red-600').addClass('text-indigo-600').text('Validando credenciales...');
    
    // Deshabilitar botón para evitar doble envío
    $('#config-form button').prop('disabled', true);

    // Intentamos obtener información general para asegurar que la conexión y el token son válidos.
    $.ajax({
        url: `${url}/api/v1/about`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        dataType: 'json',
        success: function(data) {
            // Si la respuesta es 200 y recibimos datos, asumimos que el token es válido.
            messageArea.removeClass('text-indigo-600').addClass('text-green-600');
            messageArea.text('✅ ¡Conexión exitosa! Token válido. Redirigiendo...');
            
            localStorage.setItem('FIREFLY_URL', url.replace(/\/$/, '')); // Eliminar barra inclinada final
            localStorage.setItem('FIREFLY_TOKEN', token);

            $('#setup-container').addClass('hidden');
            $('#dashboard-container').removeClass('hidden');
            
            // Inicializar el estado de la aplicación en la fase siguiente
            $(window).trigger('configLoaded'); 
        },
        error: function(xhr) {
            // Manejo de errores de la API (e.g., 401 Unauthorized, 404, o Error de red)
            let errorMessage = '';
            if (xhr.status === 401) {
                errorMessage = '❌ Token inválido. Por favor, verifica tu Token de Acceso Personal.';
            } else if (xhr.status === 403) {
                errorMessage = '❌ Permiso denegado. Asegúrate de que el token tenga permisos de lectura y escritura.';
            } else if (xhr.status === 0) {
                errorMessage = '❌ Fallo de conexión. Revisa la URL y tu conexión a internet.';
            } else {
                errorMessage = `❌ Error en la API (Status: ${xhr.status}). Intenta revisar la URL o token.`;
            }

            messageArea.removeClass('text-indigo-600').addClass('text-red-600');
            messageArea.text(errorMessage);
        },
        complete: function() {
            // Habilitar el botón de nuevo
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

    // configuración guardada?
    if (!storedUrl || !storedToken) {
        console.log('Configuración no encontrada. Mostrando pantalla de setup.');
        // Asegurarse de que el contenedor de configuración esté visible
        $('#setup-container').removeClass('hidden');
        $('#dashboard-container').addClass('hidden');
        
        // Asignar el evento al formulario
        $('#config-form').on('submit', handleConfigSubmit);
        return false; // Indica que la configuración debe ser realizada
    }

    console.log('Configuración encontrada.');
    
    window.FIREFLY_CONFIG = {
        url: storedUrl,
        token: storedToken
    };

    $('#setup-container').addClass('hidden');
    $('#dashboard-container').removeClass('hidden');
    
    return true;
}

// Ejecutar la verificación de configuración tan pronto como el DOM esté listo
$(document).ready(function() {
    const isConfigured = checkConfiguration();
    
    if (isConfigured) {
        console.log('App lista para la Fase 2: Carga de Cuentas.');
        $(window).trigger('configLoaded');
    }
});
