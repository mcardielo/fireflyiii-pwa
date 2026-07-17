(function() {
    'use strict';

    const DEFAULT_ACCOUNT_KEY = 'FIREFLY_DEFAULT_SOURCE_ACCOUNT';
    const GPS_ENABLED_KEY = 'FIREFLY_GPS_ENABLED';
    const FIELD_VISIBILITY_KEY = 'FIREFLY_FIELD_VISIBILITY';
    const DEFAULT_DEST_ACCOUNT_KEY = 'FIREFLY_DEFAULT_DEST_ACCOUNT';

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.config = {
        url: null,
        token: null,
        defaultSourceAccount: null,
        defaultDestAccount: null,
        gpsEnabled: false,
        fieldVisibility: null
    };

    /**
     * Valores por defecto de visibilidad de campos.
     * Solo aplican a withdrawals (gastos).
     */
    var DEFAULT_FIELD_VISIBILITY = {
        source: true,
        dest: true,
        category: false,
        budget: false,
        datetime: false
    };

    /**
     * Carga la visibilidad guardada o devuelve los defaults.
     */
    function getFieldVisibility() {
        try {
            var raw = localStorage.getItem(FIELD_VISIBILITY_KEY);
            if (!raw) return Object.assign({}, DEFAULT_FIELD_VISIBILITY);
            var parsed = JSON.parse(raw);
            return Object.assign({}, DEFAULT_FIELD_VISIBILITY, parsed);
        } catch (e) {
            return Object.assign({}, DEFAULT_FIELD_VISIBILITY);
        }
    }

    /**
     * Guarda la visibilidad en localStorage.
     */
    function saveFieldVisibility(vis) {
        try {
            localStorage.setItem(FIELD_VISIBILITY_KEY, JSON.stringify(vis));
            window.FFPWA.config.fieldVisibility = vis;
        } catch (e) {
            console.error('Error al guardar field visibility', e);
        }
    }

    /**
     * Carga la cuenta destino default desde localStorage.
     */
    function loadDefaultDestAccount() {
        try {
            var raw = localStorage.getItem(DEFAULT_DEST_ACCOUNT_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    /**
     * Guarda la cuenta destino default.
     */
    function saveDefaultDestAccount(account) {
        try {
            localStorage.setItem(DEFAULT_DEST_ACCOUNT_KEY, JSON.stringify(account));
            window.FFPWA.config.defaultDestAccount = account;
        } catch (e) {
            console.error('Error al guardar default dest account', e);
        }
    }

    window.FFPWA.getFieldVisibility = getFieldVisibility;
    window.FFPWA.saveFieldVisibility = saveFieldVisibility;
    window.FFPWA.config.defaultDestAccount = loadDefaultDestAccount();
    window.FFPWA.config.fieldVisibility = getFieldVisibility();

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

        // ── Render inmediato desde caché (stale-while-revalidate) ──
        // Si tenemos cuentas en caché, llenar el select ya y pre-seleccionar la cuenta guardada.
        var cachedAccounts = window.FFPWA.accountsCache;
        if (!cachedAccounts) {
            try {
                var raw = localStorage.getItem('firefly_accounts_cache');
                cachedAccounts = raw ? JSON.parse(raw) : null;
            } catch (e) { cachedAccounts = null; }
        }

        var savedDefault = window.FFPWA.config.defaultSourceAccount;

        if (cachedAccounts && cachedAccounts.length > 0) {
            // Filtrar solo asset activas (igual que el fetch)
            var assetAccounts = cachedAccounts.filter(function(a) {
                return a.type === 'asset' && a.active !== false;
            });
            if (assetAccounts.length > 0) {
                var html = '<option value="">' + __('account.select_hint') + '</option>';
                assetAccounts.forEach(function(acc) {
                    html += '<option value="' + acc.id + '" data-name="' + window.FFPWA.escapeHtml(acc.name) + '">' + window.FFPWA.escapeHtml(acc.name) + '</option>';
                });
                select.innerHTML = html;
                msg.classList.add('hidden');

                // Pre-seleccionar cuenta guardada
                if (savedDefault && savedDefault.id) {
                    select.value = savedDefault.id;
                }
            }
        }

        // ── Fetch en background para refrescar ──
        if (!url || !token) return;

        // Solo mostrar loading si no había caché
        if (!cachedAccounts || cachedAccounts.length === 0) {
            select.innerHTML = '<option value="">' + __('account.loading') + '</option>';
            msg.classList.remove('hidden', 'success', 'error');
            msg.classList.add('warning');
            msg.textContent = '🔄 ' + __('setup.loading_accounts');
        }

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

                // Pre-seleccionar cuenta guardada después del refresh
                if (savedDefault && savedDefault.id) {
                    select.value = savedDefault.id;
                }

                msg.classList.remove('hidden', 'warning', 'error');
                msg.classList.add('success');
                msg.textContent = '✅ ' + __('account.found', { count: accounts.length });
            },
            error: function(xhr) {
                // Si ya teníamos caché, no mostrar error — el usuario ya puede seleccionar
                if (cachedAccounts && cachedAccounts.length > 0) return;

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
            initQuickEntryConfig();
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

    /* ─── Quick Entry Config ─── */

    /**
     * Inicializa los toggles de visibilidad de campos y el select de cuenta destino default.
     * Solo aplica al tipo withdrawal (gasto).
     */
    function initQuickEntryConfig() {
        var vis = getFieldVisibility();
        var destArea = document.getElementById('default-dest-account-area');
        var destSelect = document.getElementById('default-dest-account-select');
        var destMsg = document.getElementById('default-dest-message');
        if (!destArea || !destSelect) return;

        // Setear toggles según visibilidad guardada
        var toggleSource = document.getElementById('toggle-field-source');
        var toggleDest = document.getElementById('toggle-field-dest');
        var toggleCategory = document.getElementById('toggle-field-category');
        var toggleBudget = document.getElementById('toggle-field-budget');
        var toggleDatetime = document.getElementById('toggle-field-datetime');

        if (toggleSource) toggleSource.checked = vis.source;
        if (toggleDest) toggleDest.checked = vis.dest;
        if (toggleCategory) toggleCategory.checked = vis.category;
        if (toggleBudget) toggleBudget.checked = vis.budget;
        if (toggleDatetime) toggleDatetime.checked = vis.datetime;

        // Mostrar/ocultar área de cuenta destino default según toggle dest
        function updateDestArea() {
            var destHidden = toggleDest && !toggleDest.checked;
            destArea.classList.toggle('hidden', !destHidden);
            if (destHidden) {
                loadDestAccountsForPicker();
            }
        }

        // Listener del toggle dest
        if (toggleDest) {
            var newToggleDest = toggleDest.cloneNode(true);
            toggleDest.parentNode.replaceChild(newToggleDest, toggleDest);
            toggleDest = newToggleDest;
            toggleDest.addEventListener('change', function() {
                updateDestArea();
            });
        }

        // Listener del toggle source
        if (toggleSource) {
            var newToggleSource = toggleSource.cloneNode(true);
            toggleSource.parentNode.replaceChild(newToggleSource, toggleSource);
            toggleSource = newToggleSource;
        }
        if (toggleCategory) {
            var newToggleCat = toggleCategory.cloneNode(true);
            toggleCategory.parentNode.replaceChild(newToggleCat, toggleCategory);
            toggleCategory = newToggleCat;
        }
        if (toggleBudget) {
            var newToggleBudget = toggleBudget.cloneNode(true);
            toggleBudget.parentNode.replaceChild(newToggleBudget, toggleBudget);
            toggleBudget = newToggleBudget;
        }
        if (toggleDatetime) {
            var newToggleDt = toggleDatetime.cloneNode(true);
            toggleDatetime.parentNode.replaceChild(newToggleDt, toggleDatetime);
            toggleDatetime = newToggleDt;
        }

        // Cargar cuenta destino default existente en el select
        function loadDestAccountsForPicker() {
            var url = window.FFPWA.config.url;
            var token = window.FFPWA.config.token;
            if (!url || !token) return;

            // ── Render inmediato desde caché (stale-while-revalidate) ──
            var cachedAccounts = window.FFPWA.accountsCache;
            if (!cachedAccounts) {
                try {
                    var raw = localStorage.getItem('firefly_accounts_cache');
                    cachedAccounts = raw ? JSON.parse(raw) : null;
                } catch (e) { cachedAccounts = null; }
            }
            var savedDest = window.FFPWA.config.defaultDestAccount;

            if (cachedAccounts && cachedAccounts.length > 0) {
                var expenseAccounts = cachedAccounts.filter(function(a) {
                    return a.type === 'expense' && a.active !== false;
                });
                if (expenseAccounts.length > 0) {
                    var html = '<option value="">' + (window.__ && window.__('account.select_hint') || 'Selecciona...') + '</option>';
                    expenseAccounts.forEach(function(acc) {
                        html += '<option value="' + acc.id + '" data-name="' + window.FFPWA.escapeHtml(acc.name) + '">' + window.FFPWA.escapeHtml(acc.name) + '</option>';
                    });
                    destSelect.innerHTML = html;
                    if (savedDest && savedDest.id) {
                        destSelect.value = savedDest.id;
                    }
                    if (destMsg) destMsg.classList.add('hidden');
                }
            }

            // Solo mostrar loading si no había caché
            if (!cachedAccounts || cachedAccounts.length === 0) {
                destSelect.innerHTML = '<option value="">' + (window.__ && window.__('account.loading') || 'Cargando...') + '</option>';
            }

            // ── Fetch en background para refrescar ──
            window.FFPWA.http({
                url: url + '/api/v1/accounts?type=expense&limit=10000',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                success: function(data) {
                    var accounts = (data.data || []).filter(function(a) { return a.attributes.active !== false; });
                    if (accounts.length === 0) {
                        destSelect.innerHTML = '<option value="">' + (window.__ && window.__('account.no_active') || 'Sin cuentas') + '</option>';
                        if (destMsg) {
                            destMsg.classList.remove('hidden', 'success');
                            destMsg.classList.add('warning');
                            destMsg.textContent = '⚠️ ' + (window.__ && window.__('config.default_dest_empty') || 'No hay cuentas expense disponibles');
                        }
                        return;
                    }
                    var html = '<option value="">' + (window.__ && window.__('account.select_hint') || 'Selecciona...') + '</option>';
                    accounts.forEach(function(acc) {
                        html += '<option value="' + acc.id + '" data-name="' + (window.FFPWA.escapeHtml(acc.attributes.name)) + '">' + window.FFPWA.escapeHtml(acc.attributes.name) + '</option>';
                    });
                    destSelect.innerHTML = html;

                    // Pre-seleccionar si ya hay default dest guardado
                    if (savedDest && savedDest.id) {
                        destSelect.value = savedDest.id;
                    }
                    if (destMsg) destMsg.classList.add('hidden');
                },
                error: function() {
                    // Si ya teníamos caché, no mostrar error
                    if (cachedAccounts && cachedAccounts.length > 0) return;
                    destSelect.innerHTML = '<option value="">' + (window.__ && window.__('account.error') || 'Error') + '</option>';
                    if (destMsg) {
                        destMsg.classList.remove('hidden', 'success');
                        destMsg.classList.add('error');
                        destMsg.textContent = '❌ ' + (window.__ && window.__('account.error') || 'Error al cargar');
                    }
                }
            });
        }

        // Estado inicial
        updateDestArea();

        // Guardar al hacer click en Save (handleDefaultAccountSave ya existe, le hacemos hook)
        var origSave = handleDefaultAccountSave;
        // Escuchar cambios en los toggles para guardar inmediatamente
        [toggleSource, toggleDest, toggleCategory, toggleBudget, toggleDatetime].forEach(function(t) {
            if (t) t.addEventListener('change', function() {
                var newVis = {
                    source: toggleSource ? toggleSource.checked : true,
                    dest: toggleDest ? toggleDest.checked : true,
                    category: toggleCategory ? toggleCategory.checked : false,
                    budget: toggleBudget ? toggleBudget.checked : false,
                    datetime: toggleDatetime ? toggleDatetime.checked : false
                };
                saveFieldVisibility(newVis);
                updateDestArea();
            });
        });

        // Guardar cuenta destino default al cambiar el select
        destSelect.addEventListener('change', function() {
            var id = this.value;
            if (!id) {
                saveDefaultDestAccount(null);
                if (destMsg) {
                    destMsg.classList.remove('hidden', 'success', 'error');
                    destMsg.classList.add('warning');
                    destMsg.textContent = '⚠️ ' + (window.__ && window.__('config.default_dest_cleared') || 'Cuenta destino default eliminada');
                    setTimeout(function() { destMsg.classList.add('hidden'); }, 2000);
                }
                return;
            }
            var opt = this.options[this.selectedIndex];
            var name = opt ? (opt.getAttribute('data-name') || opt.textContent) : '';
            saveDefaultDestAccount({ id: id, name: name });
            if (destMsg) {
                destMsg.classList.remove('hidden', 'warning', 'error');
                destMsg.classList.add('success');
                destMsg.textContent = '✅ ' + name;
                setTimeout(function() { destMsg.classList.add('hidden'); }, 2000);
            }
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