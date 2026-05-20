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

        $select.html('<option value="">' + __('account.loading') + '</option>');
        $msg.removeClass('hidden success error').addClass('warning').text('🔄 ' + __('setup.loading_accounts'));

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
                    $msg.removeClass('hidden success warning').addClass('error');
                    $msg.text('❌ ' + __('account.no_assets'));
                    $select.html('<option value="">' + __('account.no_active') + '</option>');
                    return;
                }

                let html = '<option value="">' + __('account.select_hint') + '</option>';
                accounts.forEach(acc => {
                    html += `<option value="${acc.id}" data-name="${acc.attributes.name}">${acc.attributes.name}</option>`;
                });
                $select.html(html);
                $msg.removeClass('hidden warning error').addClass('success');
                $msg.text('✅ ' + __('account.found', { count: accounts.length }));
            },
            error: function(xhr) {
                let errorMsg = '❌ ' + __('account.error');
                if (xhr.status === 401) errorMsg += ' ' + __('setup.token_401');
                else if (xhr.status === 0) errorMsg += ' ' + __('setup.no_connection');
                $msg.removeClass('hidden success warning').addClass('error').text(errorMsg);
                $select.html('<option value="">' + __('account.error') + '</option>');
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
            $msg.removeClass('hidden success warning').addClass('error');
            $msg.text('❌ ' + __('account.not_selected'));
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
        $('#tab-bar').removeClass('hidden');
        $('#tab-bar .tab-btn').removeClass('active');
        $('#tab-bar .tab-btn[data-screen="record"]').addClass('active');
        $(window).trigger('configLoaded');
    }

    /**
     * Muestra el selector de cuenta default y carga las cuentas.
     */
    function showDefaultAccountPicker() {
        $('#setup-container').addClass('hidden');
        $('#default-account-container').removeClass('hidden');
        $('#dashboard-container').addClass('hidden');
        $('#accounts-container').addClass('hidden');
        $('#tab-bar').addClass('hidden');

        $('#save-default-account-btn').on('click', handleDefaultAccountSave);
        loadAssetAccountsForPicker();
    }

    /**
     * Transiciona directamente al dashboard (ya hay cuenta default guardada).
     */
    function showDashboard() {
        $('#setup-container').addClass('hidden');
        $('#default-account-container').addClass('hidden');
        $('#accounts-container').addClass('hidden');
        $('#dashboard-container').removeClass('hidden');
        $('#tab-bar').removeClass('hidden');
        $('#tab-bar .tab-btn').removeClass('active');
        $('#tab-bar .tab-btn[data-screen="record"]').addClass('active');
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
            messageArea.removeClass('hidden success warning').addClass('error');
            messageArea.text('❌ ' + __('setup.required_fields'));
            return;
        }

        try {
            new URL(url);
        } catch (_) {
            messageArea.removeClass('hidden success warning').addClass('error');
            messageArea.text('❌ ' + __('setup.invalid_url'));
            return;
        }

        messageArea.removeClass('hidden success error').addClass('warning').text('🔄 ' + __('setup.validating'));
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
                localStorage.setItem('FIREFLY_TOKEN', _obfuscate(token));

                window.FFPWA.config.url = cleanUrl;
                window.FFPWA.config.token = token;

                // Siguiente paso: seleccionar cuenta default
                showDefaultAccountPicker();
            },
            error: function(xhr) {
                let errorMessage = '';
                if (xhr.status === 401) {
                    errorMessage = '❌ ' + __('setup.auth_invalid');
                } else if (xhr.status === 403) {
                    errorMessage = '❌ ' + __('setup.auth_forbidden');
                } else if (xhr.status === 0) {
                    errorMessage = '❌ ' + __('setup.connection_failed');
                } else {
                    errorMessage = '❌ ' + __('setup.api_error', { status: xhr.status });
                }

                messageArea.removeClass('hidden success warning').addClass('error');
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
    /**
     * Ofuscación ligera para el token en localStorage.
     * No es seguridad real — solo evita exposición accidental.
     */
    var OBFUSCATE_PREFIX = 'ff_';

    function _obfuscate(raw) {
        if (!raw) return raw;
        return OBFUSCATE_PREFIX + btoa(raw);
    }

    function _deobfuscate(obfuscated) {
        if (!obfuscated || obfuscated.indexOf(OBFUSCATE_PREFIX) !== 0) return obfuscated;
        try {
            return atob(obfuscated.slice(OBFUSCATE_PREFIX.length));
        } catch (_) {
            return obfuscated;
        }
    }

    function checkConfiguration() {
        const storedUrl = localStorage.getItem('FIREFLY_URL');
        const storedToken = _deobfuscate(localStorage.getItem('FIREFLY_TOKEN'));
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

    // Expose for orchestration — called after i18n is ready
    window.initConfig = checkConfiguration;

    // Config button: re-open default account picker
    $(document).on('click', '#config-btn, #accounts-config-btn', function() {
        showDefaultAccountPicker();
    });

})();
