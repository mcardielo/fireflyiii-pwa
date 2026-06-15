(function() {
    'use strict';

    const DEFAULT_ACCOUNT_KEY = 'FIREFLY_DEFAULT_SOURCE_ACCOUNT';
    const GPS_ENABLED_KEY = 'FIREFLY_GPS_ENABLED';

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.config = {
        url: null,
        token: null,
        defaultSourceAccount: null,
        gpsEnabled: false
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
     * Guarda la cuenta default seleccionada.
     */
    function handleDefaultAccountSave() {
        var $select = $('#default-account-select');
        var $msg = $('#default-account-message');
        var selectedId = $select.val();
        var selectedText = $select.find('option:selected').text();

        if (!selectedId) {
            $msg.removeClass('hidden success warning').addClass('error');
            $msg.text('❌ ' + __('account.not_selected'));
            return;
        }

        var defaultAccount = {
            id: selectedId,
            name: $select.find('option:selected').data('name') || selectedText
        };

        localStorage.setItem(DEFAULT_ACCOUNT_KEY, JSON.stringify(defaultAccount));
        window.FFPWA.config.defaultSourceAccount = defaultAccount;

        var isConfigTab = $('#tab-bar .tab-btn[data-screen="config"]').hasClass('active');
        if (!isConfigTab) {
            // Setup inicial
            $('#default-account-container').hide();
            $('#dashboard-container').css('display', 'flex').removeClass('hidden');
            $('#tab-bar').css('display', 'flex').removeClass('hidden');
            $('#tab-bar .tab-btn').removeClass('active');
            $('#tab-bar .tab-btn[data-screen="record"]').addClass('active');
        } else {
            // Desde tab Config: regresar a Record
            if (window.switchTab) {
                window.switchTab('record');
            }
        }

        $(window).trigger('configLoaded');
    }

    /**
     * Muestra el selector de cuenta default y carga las cuentas.
     * Cuando viene del tab Config, el tab-bar debe permanecer visible.
     */
    function showDefaultAccountPicker() {
        // Ocultar otras pantallas pero NO el tab-bar
        $('#setup-container').hide();
        $('#dashboard-container').hide();
        $('#accounts-container').hide();
        $('#history-container').hide();
        $('#default-account-container').css('display', 'flex').removeClass('hidden');

        $('#save-default-account-btn').off('click').on('click', handleDefaultAccountSave);
        loadAssetAccountsForPicker();
        setTimeout(function() {
            initSecurityUI('-2');
            initGPSToggle();
            if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        }, 100);
    }

    /**
     * Transiciona directamente al dashboard (ya hay cuenta default guardada).
     */
    function showDashboard() {
        $('#setup-container').hide();
        $('#default-account-container').hide();
        $('#accounts-container').hide();
        $('#history-container').hide();
        $('#dashboard-container').removeClass('hidden').css('display', 'flex');
        $('#tab-bar').removeClass('hidden').css('display', 'flex');
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

        // Cargar preferencia GPS
        var gpsEnabled = localStorage.getItem(GPS_ENABLED_KEY);
        window.FFPWA.config.gpsEnabled = gpsEnabled === 'true';
        if (window.FFPWA.config.gpsEnabled) {
            console.log('📍 GPS enabled, capturando ubicación inicial...');
            window.FFPWA.getLocation().then(function(loc) {
                window.FFPWA.lastLocation = loc;
            });
        }

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

    /* ─── GPS Toggle ─── */

    function initGPSToggle() {
        var $toggle = $('#gps-toggle');
        var $msg = $('#gps-message');
        if (!$toggle.length) return;

        var enabled = window.FFPWA.config.gpsEnabled === true;
        $toggle.prop('checked', enabled);

        $toggle.off('change').on('change', function() {
            var on = $(this).is(':checked');
            localStorage.setItem(GPS_ENABLED_KEY, on ? 'true' : 'false');
            window.FFPWA.config.gpsEnabled = on;

            if (on) {
                window.FFPWA.getLocation().then(function(loc) {
                    window.FFPWA.lastLocation = loc;
                });
                $msg.removeClass('hidden success error').addClass('success')
                    .text('✅ ' + (window.__ && window.__('config.gps_enabled') || 'Ubicación activada'));
            } else {
                window.FFPWA.lastLocation = null;
                $msg.removeClass('hidden success error').addClass('warning')
                    .text('🔕 ' + (window.__ && window.__('config.gps_disabled') || 'Ubicación desactivada'));
            }
            setTimeout(function() { $msg.addClass('hidden'); }, 2000);
        });
    }

    /* ─── Security UI ─── */

    function initSecurityUI(suffix) {
        suffix = suffix || '';
        var $toggle = $('#security-toggle' + suffix);
        var $biometric = $('#auth-biometric' + suffix);
        var $pinRow = $('#pin-config-row' + suffix);
        var $pinInput = $('#auth-pin' + suffix);
        var $configArea = $('#security-config-area' + suffix);
        var $msg = $('#security-message' + suffix);

        if (!$toggle.length) return;

        var enabled = window.FFPWA.auth.isEnabled();
        var method = window.FFPWA.auth.getMethod();
        $toggle.prop('checked', enabled);
        $configArea.toggleClass('hidden', !enabled);
        $biometric.prop('checked', method === 'webauthn');
        $pinRow.toggleClass('hidden', method !== 'pin');

        // Toggle security on/off
        $toggle.off('change').on('change', function() {
            var on = $(this).is(':checked');
            $configArea.toggleClass('hidden', !on);
            if (!on) {
                window.FFPWA.auth.setEnabled(false);
                $msg.removeClass('hidden success error').addClass('warning')
                    .text('🔓 ' + (window.__ && window.__('security.disabled') || 'Seguridad desactivada'));
                setTimeout(function() { $msg.addClass('hidden'); }, 2000);
            } else {
                window.FFPWA.auth.setEnabled(true);
                // Trigger biometric registration if checkbox is already checked
                if ($biometric.is(':checked')) {
                    $biometric.trigger('change');
                }
            }
        });

        // Toggle biometric vs PIN
        $biometric.off('change').on('change', function() {
            var useBiometric = $(this).is(':checked');
            $pinRow.toggleClass('hidden', useBiometric);

            if (useBiometric) {
                window.FFPWA.auth.setMethod('webauthn');
                window.FFPWA.auth.webauthnAvailable().then(function(avail) {
                    if (!avail) {
                        $msg.removeClass('hidden success error').addClass('warning')
                            .text('⚠️ ' + (window.__ && window.__('security.no_biometric') || 'Biometría no disponible'));
                        $biometric.prop('checked', false);
                        $pinRow.removeClass('hidden');
                        window.FFPWA.auth.setMethod('pin');
                    } else {
                        window.FFPWA.auth.registerWebAuthn().then(function(ok) {
                            if (ok) {
                                window.FFPWA.auth.setEnabled(true);
                                window.FFPWA.auth.setMethod('webauthn');
                                $msg.removeClass('hidden warning error').addClass('success')
                                    .text('✅ ' + (window.__ && window.__('security.biometric_ready') || 'Biometría lista'));
                                setTimeout(function() { $msg.addClass('hidden'); }, 2000);
                            }
                        });
                    }
                });
            } else {
                window.FFPWA.auth.setMethod('pin');
                $pinRow.removeClass('hidden');
            }
        });

        // PIN input
        $pinInput.off('input').on('input', function() {
            var pin = $(this).val();
            if (pin.length >= 4) {
                window.FFPWA.auth.setPin(pin).then(function() {
                    window.FFPWA.auth.setEnabled(true);
                    window.FFPWA.auth.setMethod('pin');
                    $msg.removeClass('hidden warning error').addClass('success')
                        .text('✅ ' + (window.__ && window.__('security.pin_ready') || 'PIN configurado'));
                    setTimeout(function() { $msg.addClass('hidden'); }, 1500);
                });
            }
        });

        // If security is already enabled with webauthn and no credential stored, register
        if (enabled && method === 'webauthn' && !window.FFPWA.auth.hasCredential()) {
            window.FFPWA.auth.webauthnAvailable().then(function(avail) {
                if (avail) {
                    window.FFPWA.auth.registerWebAuthn();
                }
            });
        }
    }

    window.initConfig = checkConfiguration;
    window.showDefaultAccountPicker = showDefaultAccountPicker;

})();
