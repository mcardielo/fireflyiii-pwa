(function() {
    'use strict';

    const DEFAULT_ACCOUNT_KEY = 'FIREFLY_DEFAULT_SOURCE_ACCOUNT';

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.config = {
        url: null,
        token: null,
        defaultSourceAccount: null
    };

    /**
     * Carga las cuentas asset desde la API y llena el dropdown
     * de selección de cuenta default.
     */
    function loadAssetAccountsForPicker() {
        const url = window.FFPWA.config.url;
        const token = window.FFPWA.config.token;
        const $select = $('#default-account-select');
        const $msg = $('#default-account-message');

        $select.html('<option value="">Cargando cuentas...</option>');
        $msg.removeClass('text-green-600 text-red-600').addClass('text-indigo-600').text('Obteniendo cuentas...');

        $.ajax({
            url: `${url}/api/v1/accounts?type=asset&limit=10000`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            dataType: 'json',
            success: function(data) {
                let accounts = data.data || [];
                // Filtrar solo cuentas activas
                accounts = accounts.filter(acc => acc.attributes.active !== false);

                if (accounts.length === 0) {
                    $msg.removeClass('text-indigo-600').addClass('text-red-600');
                    $msg.text('❌ No se encontraron cuentas Asset activas. Activa una en Firefly III.');
                    $select.html('<option value="">Sin cuentas activas disponibles</option>');
                    return;
                }

                let html = '<option value="">-- Selecciona una cuenta --</option>';
                accounts.forEach(acc => {
                    html += `<option value="${acc.id}" data-name="${acc.attributes.name}">${acc.attributes.name}</option>`;
                });
                $select.html(html);
                $msg.removeClass('text-indigo-600').addClass('text-green-600');
                $msg.text(`✅ ${accounts.length} cuenta(s) Asset encontrada(s). Selecciona la default.`);
            },
            error: function(xhr) {
                let errorMsg = '❌ Error al cargar cuentas.';
                if (xhr.status === 401) errorMsg += ' Token inválido.';
                else if (xhr.status === 0) errorMsg += ' Sin conexión.';
                $msg.removeClass('text-indigo-600').addClass('text-red-600').text(errorMsg);
                $select.html('<option value="">Error al cargar</option>');
            }
        });
    }

    /**
     * Guarda la cuenta default seleccionada y transiciona al dashboard.
     */
    function handleDefaultAccountSave() {
        const $select = $('#default-account-select');
        const $msg = $('#default-account-message');
        const selectedId = $select.val();
        const selectedText = $select.find('option:selected').text();

        if (!selectedId) {
            $msg.removeClass('text-green-600').addClass('text-red-600');
            $msg.text('❌ Por favor, selecciona una cuenta.');
            return;
        }

        const defaultAccount = {
            id: selectedId,
            name: $select.find('option:selected').data('name') || selectedText
        };

        localStorage.setItem(DEFAULT_ACCOUNT_KEY, JSON.stringify(defaultAccount));
        window.FFPWA.config.defaultSourceAccount = defaultAccount;

        // Transicionar al dashboard
        $('#default-account-container').addClass('hidden');
        $('#dashboard-container').removeClass('hidden');
        $(window).trigger('configLoaded');
    }

    /**
     * Muestra el selector de cuenta default y carga las cuentas.
     */
    function showDefaultAccountPicker() {
        $('#setup-container').addClass('hidden');
        $('#default-account-container').removeClass('hidden');
        $('#dashboard-container').addClass('hidden');

        $('#save-default-account-btn').on('click', handleDefaultAccountSave);
        loadAssetAccountsForPicker();
    }

    /**
     * Transiciona directamente al dashboard (ya hay cuenta default guardada).
     */
    function showDashboard() {
        $('#setup-container').addClass('hidden');
        $('#default-account-container').addClass('hidden');
        $('#dashboard-container').removeClass('hidden');
        $(window).trigger('configLoaded');
    }

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
                const cleanUrl = url.replace(/\/$/, '');

                // Guardar URL y token
                localStorage.setItem('FIREFLY_URL', cleanUrl);
                localStorage.setItem('FIREFLY_TOKEN', token);

                window.FFPWA.config.url = cleanUrl;
                window.FFPWA.config.token = token;

                // Siguiente paso: seleccionar cuenta default
                showDefaultAccountPicker();
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
        const storedDefault = localStorage.getItem(DEFAULT_ACCOUNT_KEY);

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

        if (storedDefault) {
            window.FFPWA.config.defaultSourceAccount = JSON.parse(storedDefault);
            console.log('Cuenta default encontrada:', window.FFPWA.config.defaultSourceAccount.name);
            showDashboard();
        } else {
            console.log('Sin cuenta default. Mostrando selector.');
            showDefaultAccountPicker();
        }

        return true;
    }

    $(document).ready(function() {
        checkConfiguration();
    });

})();
