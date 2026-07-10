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
        const select = document.getElementById('default-account-select');
        const msg = document.getElementById('default-account-message');

        if (!select || !msg) return;

        select.innerHTML = '<option value="">' + __('account.loading') + '</option>';
        msg.classList.remove('hidden', 'success', 'error');
        msg.classList.add('warning');
        msg.textContent = '🔄 ' + __('setup.loading_accounts');

        window.FFPWA.http({
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
                    msg.classList.remove('hidden', 'success', 'warning');
                    msg.classList.add('error');
                    msg.textContent = '❌ ' + __('account.no_assets');
                    select.innerHTML = '<option value="">' + __('account.no_active') + '</option>';
                    return;
                }

                let html = '<option value="">' + __('account.select_hint') + '</option>';
                accounts.forEach(acc => {
                    html += `<option value="${acc.id}" data-name="${acc.attributes.name}">${acc.attributes.name}</option>`;
                });
                select.innerHTML = html;
                msg.classList.remove('hidden', 'warning', 'error');
                msg.classList.add('success');
                msg.textContent = '✅ ' + __('account.found', { count: accounts.length });
            },
            error: function(xhr) {
                let errorMsg = '❌ ' + __('account.error');
                if (xhr.status === 401) errorMsg += ' ' + __('setup.token_401');
                else if (xhr.status === 0) errorMsg += ' ' + __('setup.no_connection');
                msg.classList.remove('hidden', 'success', 'warning');
                msg.classList.add('error');
                msg.textContent = errorMsg;
                select.innerHTML = '<option value="">' + __('account.error') + '</option>';
            }
        });
    }

    /**
     * Guarda la cuenta default seleccionada.
     */
    function handleDefaultAccountSave() {
        var select = document.getElementById('default-account-select');
        var msg = document.getElementById('default-account-message');
        if (!select) return;
        var selectedId = select.value;
        var selectedOption = select.options[select.selectedIndex];
        var selectedText = selectedOption ? selectedOption.textContent : '';

        if (!selectedId) {
            msg.classList.remove('hidden', 'success', 'warning');
            msg.classList.add('error');
            msg.textContent = '❌ ' + __('account.not_selected');
            return;
        }

        var defaultAccount = {
            id: selectedId,
            name: (selectedOption ? selectedOption.getAttribute('data-name') : '') || selectedText
        };

        localStorage.setItem(DEFAULT_ACCOUNT_KEY, JSON.stringify(defaultAccount));
        window.FFPWA.config.defaultSourceAccount = defaultAccount;

        var isConfigTab = false;
        var configTab = document.querySelector('#tab-bar .tab-btn[data-screen="config"]');
        if (configTab) isConfigTab = configTab.classList.contains('active');

        if (!isConfigTab) {
            // Setup inicial
            var dac = document.getElementById('default-account-container');
            var dc = document.getElementById('dashboard-container');
            var tb = document.getElementById('tab-bar');
            if (dac) dac.style.display = 'none';
            if (dc) { dc.style.display = 'flex'; dc.classList.remove('hidden'); }
            if (tb) { tb.style.display = 'flex'; tb.classList.remove('hidden'); }
            document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
            var recordBtn = document.querySelector('#tab-bar .tab-btn[data-screen="record"]');
            if (recordBtn) recordBtn.classList.add('active');
        } else {
            // Desde tab Config: regresar a Record
            if (window.switchTab) {
                window.switchTab('record');
            }
        }

        window.dispatchEvent(new Event('configLoaded'));
    }

    /**
     * Muestra el selector de cuenta default y carga las cuentas.
     * Cuando viene del tab Config, el tab-bar debe permanecer visible.
     */
    function showDefaultAccountPicker() {
        // Ocultar otras pantallas pero NO el tab-bar
        var els = {
            setup: document.getElementById('setup-container'),
            dashboard: document.getElementById('dashboard-container'),
            accounts: document.getElementById('accounts-container'),
            history: document.getElementById('history-container'),
            defaultAccount: document.getElementById('default-account-container')
        };
        if (els.setup) els.setup.style.display = 'none';
        if (els.dashboard) els.dashboard.style.display = 'none';
        if (els.accounts) els.accounts.style.display = 'none';
        if (els.history) els.history.style.display = 'none';
        if (els.defaultAccount) { els.defaultAccount.style.display = 'flex'; els.defaultAccount.classList.remove('hidden'); }

        var saveBtn = document.getElementById('save-default-account-btn');
        if (saveBtn) {
            // Remove existing listeners by cloning
            var newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            newSaveBtn.addEventListener('click', handleDefaultAccountSave);
        }
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
        var els = {
            setup: document.getElementById('setup-container'),
            defaultAccount: document.getElementById('default-account-container'),
            accounts: document.getElementById('accounts-container'),
            history: document.getElementById('history-container'),
            dashboard: document.getElementById('dashboard-container'),
            tabBar: document.getElementById('tab-bar')
        };
        if (els.setup) els.setup.style.display = 'none';
        if (els.defaultAccount) els.defaultAccount.style.display = 'none';
        if (els.accounts) els.accounts.style.display = 'none';
        if (els.history) els.history.style.display = 'none';
        if (els.dashboard) { els.dashboard.classList.remove('hidden'); els.dashboard.style.display = 'flex'; }
        if (els.tabBar) { els.tabBar.classList.remove('hidden'); els.tabBar.style.display = 'flex'; }
        document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
        var recordBtn = document.querySelector('#tab-bar .tab-btn[data-screen="record"]');
        if (recordBtn) recordBtn.classList.add('active');
        window.dispatchEvent(new Event('configLoaded'));
    }

    /**
     * Gestiona el envío del formulario de configuración.
     */
    function handleConfigSubmit(e) {
        e.preventDefault();

        const url = document.getElementById('firefly-url').value.trim();
        const token = document.getElementById('personal-token').value.trim();
        const messageArea = document.getElementById('config-message');

        if (!url || !token) {
            messageArea.classList.remove('hidden', 'success', 'warning');
            messageArea.classList.add('error');
            messageArea.textContent = '❌ ' + __('setup.required_fields');
            return;
        }

        try {
            new URL(url);
        } catch (_) {
            messageArea.classList.remove('hidden', 'success', 'warning');
            messageArea.classList.add('error');
            messageArea.textContent = '❌ ' + __('setup.invalid_url');
            return;
        }

        messageArea.classList.remove('hidden', 'success', 'error');
        messageArea.classList.add('warning');
        messageArea.textContent = '🔄 ' + __('setup.validating');
        document.querySelectorAll('#config-form button').forEach(function(btn) { btn.disabled = true; });

        window.FFPWA.http({
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

                messageArea.classList.remove('hidden', 'success', 'warning');
                messageArea.classList.add('error');
                messageArea.textContent = errorMessage;
            },
            complete: function() {
                document.querySelectorAll('#config-form button').forEach(function(btn) { btn.disabled = false; });
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
            var setupEl = document.getElementById('setup-container');
            var dashboardEl = document.getElementById('dashboard-container');
            if (setupEl) setupEl.classList.remove('hidden');
            if (dashboardEl) dashboardEl.classList.add('hidden');
            var form = document.getElementById('config-form');
            if (form) form.addEventListener('submit', handleConfigSubmit);
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
        // ── GPS toggle: update visibility ──
        window.FFPWA._updateGPSToggleVisibility();

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
        var toggle = document.getElementById('gps-toggle');
        var msg = document.getElementById('gps-message');
        if (!toggle) return;

        var enabled = window.FFPWA.config.gpsEnabled === true;
        toggle.checked = enabled;

        // Remove existing listeners by cloning
        var newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        toggle = newToggle;

        toggle.addEventListener('change', function() {
            var on = this.checked;
            localStorage.setItem(GPS_ENABLED_KEY, on ? 'true' : 'false');
            window.FFPWA.config.gpsEnabled = on;

            if (on) {
                window.FFPWA.getLocation().then(function(loc) {
                    window.FFPWA.lastLocation = loc;
                });
                msg.classList.remove('hidden', 'success', 'error');
                msg.classList.add('success');
                msg.textContent = '✅ ' + (window.__ && window.__('config.gps_enabled') || 'Ubicación activada');
            } else {
                window.FFPWA.lastLocation = null;
                msg.classList.remove('hidden', 'success', 'error');
                msg.classList.add('warning');
                msg.textContent = '🔕 ' + (window.__ && window.__('config.gps_disabled') || 'Ubicación desactivada');
            }
            setTimeout(function() { msg.classList.add('hidden'); }, 2000);
        });
    }

    /* ─── Security UI ─── */

    function initSecurityUI(suffix) {
        suffix = suffix || '';
        var toggle = document.getElementById('security-toggle' + suffix);
        var biometric = document.getElementById('auth-biometric' + suffix);
        var pinRow = document.getElementById('pin-config-row' + suffix);
        var pinInput = document.getElementById('auth-pin' + suffix);
        var configArea = document.getElementById('security-config-area' + suffix);
        var msg = document.getElementById('security-message' + suffix);

        if (!toggle) return;

        var enabled = window.FFPWA.auth.isEnabled();
        var method = window.FFPWA.auth.getMethod();
        toggle.checked = enabled;
        if (configArea) configArea.classList.toggle('hidden', !enabled);
        if (biometric) biometric.checked = (method === 'webauthn');
        if (pinRow) pinRow.classList.toggle('hidden', method !== 'pin');

        // Toggle security on/off
        var newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        toggle = newToggle;

        toggle.addEventListener('change', function() {
            var on = this.checked;
            if (configArea) configArea.classList.toggle('hidden', !on);
            if (!on) {
                window.FFPWA.auth.setEnabled(false);
                msg.classList.remove('hidden', 'success', 'error');
                msg.classList.add('warning');
                msg.textContent = '🔓 ' + (window.__ && window.__('security.disabled') || 'Seguridad desactivada');
                setTimeout(function() { msg.classList.add('hidden'); }, 2000);
            } else {
                window.FFPWA.auth.setEnabled(true);
                // Trigger biometric registration if checkbox is already checked
                if (biometric && biometric.checked) {
                    biometric.dispatchEvent(new Event('change'));
                }
            }
        });

        // Toggle biometric vs PIN
        if (biometric) {
            var newBio = biometric.cloneNode(true);
            biometric.parentNode.replaceChild(newBio, biometric);
            biometric = newBio;

            biometric.addEventListener('change', function() {
                var useBiometric = this.checked;
                if (pinRow) pinRow.classList.toggle('hidden', useBiometric);

                if (useBiometric) {
                    window.FFPWA.auth.setMethod('webauthn');
                    window.FFPWA.auth.webauthnAvailable().then(function(avail) {
                        if (!avail) {
                            msg.classList.remove('hidden', 'success', 'error');
                            msg.classList.add('warning');
                            msg.textContent = '⚠️ ' + (window.__ && window.__('security.no_biometric') || 'Biometría no disponible');
                            biometric.checked = false;
                            if (pinRow) pinRow.classList.remove('hidden');
                            window.FFPWA.auth.setMethod('pin');
                        } else {
                            window.FFPWA.auth.registerWebAuthn().then(function(ok) {
                                if (ok) {
                                    window.FFPWA.auth.setEnabled(true);
                                    window.FFPWA.auth.setMethod('webauthn');
                                    msg.classList.remove('hidden', 'warning', 'error');
                                    msg.classList.add('success');
                                    msg.textContent = '✅ ' + (window.__ && window.__('security.biometric_ready') || 'Biometría lista');
                                    setTimeout(function() { msg.classList.add('hidden'); }, 2000);
                                }
                            });
                        }
                    });
                } else {
                    window.FFPWA.auth.setMethod('pin');
                    if (pinRow) pinRow.classList.remove('hidden');
                }
            });
        }

        // PIN input
        if (pinInput) {
            var newPin = pinInput.cloneNode(true);
            pinInput.parentNode.replaceChild(newPin, pinInput);
            pinInput = newPin;

            pinInput.addEventListener('input', function() {
                var pin = this.value;
                if (pin.length >= 4) {
                    window.FFPWA.auth.setPin(pin).then(function() {
                        window.FFPWA.auth.setEnabled(true);
                        window.FFPWA.auth.setMethod('pin');
                        msg.classList.remove('hidden', 'warning', 'error');
                        msg.classList.add('success');
                        msg.textContent = '✅ ' + (window.__ && window.__('security.pin_ready') || 'PIN configurado');
                        setTimeout(function() { msg.classList.add('hidden'); }, 1500);
                    });
                }
            });
        }

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