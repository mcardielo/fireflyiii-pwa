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

        var badges = document.querySelectorAll('.online-status');
        badges.forEach(function(badge) {
            if (state === 'offline') {
                badge.classList.remove('text-ios-green', 'bg-ios-green-bg', 'text-ios-red');
                badge.classList.add('text-ios-orange', 'bg-ios-orange-bg');
                badge.textContent = t('nav.offline', '● Offline');
            } else if (state === 'server_down') {
                badge.classList.remove('text-ios-green', 'bg-ios-green-bg', 'text-ios-orange', 'bg-ios-orange-bg');
                badge.classList.add('text-ios-red', 'bg-ios-orange-bg');
                badge.textContent = t('nav.server_down', '🔶 Servidor no disponible');
            } else if (state === 'checking') {
                badge.classList.remove('text-ios-green', 'bg-ios-green-bg', 'text-ios-red');
                badge.classList.add('text-ios-orange', 'bg-ios-orange-bg');
                badge.textContent = t('nav.server_checking', '🔶 Verificando...');
            } else {
                badge.classList.remove('text-ios-orange', 'bg-ios-orange-bg', 'text-ios-red');
                badge.classList.add('text-ios-green', 'bg-ios-green-bg');
                badge.textContent = t('nav.online', '● Online');
            }
        });
    };

    // Registrar SW inmediatamente (no esperar DOMReady)
    registerServiceWorker();

    /**
     * Reposiciona los dropdowns de autocomplete visibles.
     * Útil cuando el teclado del móvil abre/cierra (resize) o el usuario scrollea.
     */
    function repositionAutocompleteDropdowns() {
        document.querySelectorAll('.autocomplete-dropdown.visible').forEach(function(dropdown) {
            var wrapper = dropdown.closest('.relative');
            var input = wrapper ? wrapper.querySelector('input') : null;
            if (!input) {
                var inputId = dropdown.id.replace('-autocomplete', '');
                input = document.getElementById(inputId);
            }
            if (input) {
                var rect = input.getBoundingClientRect();
                // Solo reposicionar si el input está visible en el viewport
                if (rect.width > 0 && rect.height > 0) {
                    dropdown.style.top = (rect.bottom + 4) + 'px';
                    dropdown.style.left = rect.left + 'px';
                    dropdown.style.width = rect.width + 'px';
                }
            }
        });
    }

    // Usar visualViewport si está disponible (mejor precisión con teclado en móvil)
    var vv = window.visualViewport;
    if (vv) {
        vv.addEventListener('resize', function() {
            requestAnimationFrame(repositionAutocompleteDropdowns);
        });
        vv.addEventListener('scroll', function() {
            requestAnimationFrame(repositionAutocompleteDropdowns);
        });
    }

    // Reposicionar en resize y scroll de cualquier contenedor
    window.addEventListener('resize', function() {
        requestAnimationFrame(repositionAutocompleteDropdowns);
    });
    document.addEventListener('scroll', function() {
        requestAnimationFrame(repositionAutocompleteDropdowns);
    });
    // Reposicionar también al enfocar un input
    document.addEventListener('focusin', function() {
        requestAnimationFrame(repositionAutocompleteDropdowns);
    });

    /*
     *  Boot de la app: montar UI restante, configurar pantallas, handlers.
     *  Si DOMContentLoaded ya disparó (SW cache), ejecutar inmediatamente.
     */
    function startBoot() {

        var loadingEl = document.getElementById('loading-screen');

        function hideLoadingScreen() {
            if (loadingEl) loadingEl.style.display = 'none';
        }

        function showOfflineFallback() {
            hideLoadingScreen();
            var appEl = document.getElementById('app');
            if (appEl) {
                appEl.innerHTML =
                    '<div style="text-align:center;padding:60px 20px;color:#8e8e93">' +
                    '  <div style="font-size:48px;margin-bottom:16px">📡</div>' +
                    '  <p style="font-size:17px;font-weight:500;color:#1c1c1e;margin-bottom:8px">Sin conexión</p>' +
                    '  <p style="font-size:14px">Conéctate a internet y vuelve a abrir la app.</p>' +
                    '</div>';
            }
        }

        // ── Consolidated global event listeners ──
        function setupGlobalListeners() {
            // configLoaded: disparar init en módulos de datos
            window.addEventListener('configLoaded', function() {
                if (window.FFPWA._initAccountsOnConfigLoaded) window.FFPWA._initAccountsOnConfigLoaded();
                if (window.FFPWA._initCurrenciesOnConfigLoaded) window.FFPWA._initCurrenciesOnConfigLoaded();
                if (window.FFPWA._updateGPSToggleVisibility) window.FFPWA._updateGPSToggleVisibility();
            });

            // localeChanged: traducir módulos
            window.addEventListener('localeChanged', function() {
                if (window.FFPWA._onLocaleAccounts) window.FFPWA._onLocaleAccounts();
                if (window.FFPWA._onLocaleAccountsScreen) window.FFPWA._onLocaleAccountsScreen();
                if (window.FFPWA._onLocaleHistory) window.FFPWA._onLocaleHistory();
                if (window.FFPWA._onLocaleEdit) window.FFPWA._onLocaleEdit();
            });

            // online / offline: health-check + sync
            window.addEventListener('online', function() {
                if (window.FFPWA._onOnline) window.FFPWA._onOnline();
            });
            window.addEventListener('offline', function() {
                if (window.FFPWA._onOffline) window.FFPWA._onOffline();
            });

            // visibilitychange: health-check + GPS refresh
            document.addEventListener('visibilitychange', function() {
                if (window.FFPWA._onVisibilityChange) window.FFPWA._onVisibilityChange();
            });
        }

        function boot() {
            var appEl = document.getElementById('app');
            if (!appEl) {
                showOfflineFallback();
                return;
            }

            // ── Montar templates --
            if (!document.getElementById('dashboard-container')) {
                appEl.appendChild(document.getElementById('screen-setup').content.cloneNode(true));
                appEl.appendChild(document.getElementById('screen-account-picker').content.cloneNode(true));
                appEl.appendChild(document.getElementById('screen-record').content.cloneNode(true));
            }

            // Inyectar iconos en los templates recién montados
            if (window.injectIcons) window.injectIcons();

            // ── Montar tab bar ──
            var tabBarHtml =
                '<div id="tab-bar" class="hidden">' +
                    '<button class="tab-btn active" data-screen="record">' +
                                                '<span class="tab-icon">' + Icons.receipt + '</span>' +
                        '<span class="tab-label" data-i18n="nav.record">Registro</span>' +
                    '</button>' +
                    '<button class="tab-btn" data-screen="accounts">' +
                                                '<span class="tab-icon">' + Icons.wallet + '</span>' +
                        '<span class="tab-label" data-i18n="nav.accounts">Cuentas</span>' +
                    '</button>' +
                    '<button class="tab-btn" data-screen="history">' +
                                                '<span class="tab-icon">' + Icons.clock + '</span>' +
                        '<span class="tab-label" data-i18n="nav.history">Historial</span>' +
                    '</button>' +
                    '<button class="tab-btn" data-screen="config">' +
                                                '<span class="tab-icon">' + Icons.cogTab + '</span>' +
                        '<span class="tab-label" data-i18n="nav.config">Config</span>' +
                    '</button>' +
                '</div>';
            appEl.insertAdjacentHTML('beforeend', tabBarHtml);

            // ── Theme icons init ──
            if (window.FFPWA && window.FFPWA.theme) {
                var mode = window.FFPWA.theme.getCurrent();
                document.querySelectorAll('.theme-toggle .theme-icon').forEach(function(icon) {
                    icon.innerHTML = mode === 'dark' ? Icons.sun : Icons.moon;
                });
            }

            /* ─── Montar utility ─── */
            window.mountScreen = function(templateId) {
                var tpl = document.getElementById(templateId);
                if (!tpl) return;
                var content = tpl.content;
                var firstEl = content.firstElementChild;
                if (firstEl && firstEl.id && document.getElementById(firstEl.id)) return;
                var clone = content.cloneNode(true);
                var root = clone.firstElementChild;
                appEl.appendChild(clone);

                // Inyectar iconos en el template recién montado
                if (window.injectIcons && root) {
                    window.injectIcons(root);
                }

                if (window.FFPWA && window.FFPWA.theme) {
                    var mdl = window.FFPWA.theme.getCurrent();
                    document.querySelectorAll('.theme-toggle .theme-icon').forEach(function(icon) {
                        icon.innerHTML = mdl === 'dark' ? Icons.sun : Icons.moon;
                    });
                }
            };

            /* ─── Lock Screen ─── */
            var pendingScreen = null;

            function showLockScreen(screen) {
                pendingScreen = screen || 'accounts';
                window.mountScreen('screen-lock');
                var lockContainer = document.getElementById('lock-container');
                var accountsContainer = document.getElementById('accounts-container');
                var tabBar = document.getElementById('tab-bar');
                if (lockContainer) { lockContainer.style.display = 'flex'; lockContainer.classList.remove('hidden'); }
                if (accountsContainer) accountsContainer.classList.add('hidden');
                if (tabBar) tabBar.classList.add('hidden');

                var lockPinArea = document.getElementById('lock-pin-area');
                var lockPinError = document.getElementById('lock-pin-error');
                var lockLoading = document.getElementById('lock-loading');
                if (lockPinArea) lockPinArea.classList.add('hidden');
                if (lockPinError) lockPinError.classList.add('hidden');
                if (lockLoading) lockLoading.classList.add('hidden');

                var method = window.FFPWA.auth.getMethod();
                var hasPin = window.FFPWA.auth.hasPin();
                var lockBtnText = document.getElementById('lock-btn-text');

                if (method === 'webauthn' && !hasPin) {
                    if (lockBtnText) lockBtnText.innerHTML = Icons.lockSm;
                } else if (method === 'webauthn' && hasPin) {
                    if (lockBtnText) lockBtnText.innerHTML = Icons.lockSm + ' ' + (window.__ && window.__('lock.unlock_biometric') || 'Desbloquear con biometría');
                    if (lockPinArea) lockPinArea.classList.remove('hidden');
                } else {
                    if (lockBtnText) lockBtnText.classList.add('hidden');
                    if (lockPinArea) lockPinArea.classList.remove('hidden');
                }

                if (window.i18nTranslateDOM) window.i18nTranslateDOM();
            }

            function hideLockScreen() {
                var lockContainer = document.getElementById('lock-container');
                if (lockContainer) lockContainer.style.display = 'none';
                pendingScreen = null;
            }

            function handleUnlockSuccess() {
                var target = pendingScreen || 'accounts';
                hideLockScreen();
                window.FFPWA.auth.unlocked = true;
                pendingScreen = null;

                var accountsContainer, tabBar;
                if (target === 'accounts') {
                    accountsContainer = document.getElementById('accounts-container');
                    if (accountsContainer) { accountsContainer.style.display = 'flex'; accountsContainer.classList.remove('hidden'); }
                    if (window.FFPWA.showAccountsScreen) window.FFPWA.showAccountsScreen();
                } else if (target === 'history') {
                    var historyContainer = document.getElementById('history-container');
                    if (historyContainer) { historyContainer.style.display = 'flex'; historyContainer.classList.remove('hidden'); }
                    if (window.FFPWA.showHistoryScreen) window.FFPWA.showHistoryScreen();
                } else if (target === 'config') {
                    var defaultAccountContainer = document.getElementById('default-account-container');
                    if (defaultAccountContainer) { defaultAccountContainer.style.display = 'flex'; defaultAccountContainer.classList.remove('hidden'); }
                    window.showDefaultAccountPicker();
                    tabBar = document.getElementById('tab-bar');
                    if (tabBar) {
                        document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
                        var configBtn = document.querySelector('#tab-bar .tab-btn[data-screen="config"]');
                        if (configBtn) configBtn.classList.add('active');
                    }
                }

                tabBar = document.getElementById('tab-bar');
                if (tabBar) { tabBar.style.display = 'flex'; tabBar.classList.remove('hidden'); }
                updateLangBtn(window.getLocale());
            }

            /* ─── Tab switching ─── */
            function switchTab(screen) {
                // Forzar ocultar todas las pantallas
                var hideIds = ['setup-container', 'default-account-container', 'dashboard-container', 'accounts-container', 'history-container', 'lock-container'];
                hideIds.forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });

                if (screen === 'record') {
                    var dc = document.getElementById('dashboard-container');
                    if (dc) { dc.style.display = 'flex'; dc.classList.remove('hidden'); }
                    window.FFPWA._updateGPSToggleVisibility();
                } else if (screen === 'accounts') {
                    window.mountScreen('screen-accounts');
                    if (window.FFPWA.auth && window.FFPWA.auth.needsAuth()) {
                        showLockScreen('accounts');
                    } else {
                        var ac = document.getElementById('accounts-container');
                        if (ac) { ac.style.display = 'flex'; ac.classList.remove('hidden'); }
                        if (window.FFPWA.showAccountsScreen) window.FFPWA.showAccountsScreen();
                    }
                } else if (screen === 'history') {
                    window.mountScreen('screen-history');
                    if (window.FFPWA.auth && window.FFPWA.auth.needsAuth()) {
                        showLockScreen('history');
                    } else {
                        var hc = document.getElementById('history-container');
                        if (hc) { hc.style.display = 'flex'; hc.classList.remove('hidden'); }
                        if (window.FFPWA.showHistoryScreen) window.FFPWA.showHistoryScreen();
                    }
                } else if (screen === 'config') {
                    if (window.FFPWA.auth && window.FFPWA.auth.needsAuth()) {
                        showLockScreen('config');
                    } else {
                        var dac = document.getElementById('default-account-container');
                        if (dac) { dac.style.display = 'flex'; dac.classList.remove('hidden'); }
                        window.showDefaultAccountPicker();
                        var tb = document.getElementById('tab-bar');
                        if (tb) { tb.style.display = 'flex'; tb.classList.remove('hidden'); }
                        document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
                        var configBtn = document.querySelector('#tab-bar .tab-btn[data-screen="config"]');
                        if (configBtn) configBtn.classList.add('active');
                        updateLangBtn(window.getLocale());
                        return;
                    }
                }

                document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
                var activeBtn = document.querySelector('#tab-bar .tab-btn[data-screen="' + screen + '"]');
                if (activeBtn) activeBtn.classList.add('active');
                var tb2 = document.getElementById('tab-bar');
                if (tb2) { tb2.style.display = 'flex'; tb2.classList.remove('hidden'); }

                if (!navigator.onLine) {
                    window.FFPWA.updateStatus('offline');
                }
                updateLangBtn(window.getLocale());
                if (window.i18nTranslateDOM) window.i18nTranslateDOM();
            }

            window.switchTab = switchTab;

            /* ─── Event handlers ─── */
            document.addEventListener('click', function(e) {
                if (e.target.closest('#lock-cancel-btn')) {
                    hideLockScreen();
                    switchTab('record');
                }
            });

            document.addEventListener('click', function(e) {
                if (e.target.closest('#lock-unlock-btn')) {
                    var method = window.FFPWA.auth.getMethod();
                    var lockLoading = document.getElementById('lock-loading');
                    if (lockLoading) lockLoading.classList.remove('hidden');

                    window.FFPWA.auth.unlock(method).then(function(success) {
                        var ll = document.getElementById('lock-loading');
                        if (ll) ll.classList.add('hidden');
                        if (success) {
                            handleUnlockSuccess();
                        } else {
                            if (window.FFPWA.auth.hasPin()) {
                                var lpa = document.getElementById('lock-pin-area');
                                var lbt = document.getElementById('lock-btn-text');
                                if (lpa) lpa.classList.remove('hidden');
                                if (lbt) lbt.innerHTML = Icons.lockSm + ' ' + 'Usar PIN';
                            }
                        }
                    });
                }
            });

            document.addEventListener('input', function(e) {
                if (e.target && e.target.id === 'lock-pin-input') {
                    var pin = e.target.value;
                    if (pin.length >= 4) {
                        var lpe = document.getElementById('lock-pin-error');
                        if (lpe) lpe.classList.add('hidden');
                        window.FFPWA.auth.verifyPin(pin).then(function(valid) {
                            if (valid) {
                                handleUnlockSuccess();
                            } else {
                                var errEl = document.getElementById('lock-pin-error');
                                if (errEl) errEl.classList.remove('hidden');
                                e.target.value = '';
                            }
                        });
                    }
                }
            });

            document.addEventListener('click', function(e) {
                var tabBtn = e.target.closest('#tab-bar .tab-btn');
                if (!tabBtn) return;
                var screen = tabBtn.getAttribute('data-screen');
                if (tabBtn.classList.contains('active')) return;
                switchTab(screen);
            });

            document.addEventListener('click', function(e) {
                var langBtn = e.target.closest('.lang-btn');
                if (!langBtn) return;
                var current = window.getLocale();
                var next = current === 'es' ? 'en' : 'es';
                window.setLocale(next).then(function() {
                    document.documentElement.setAttribute('lang', next);
                    updateLangBtn(next);
                });
            });

            function updateLangBtn(locale) {
                document.querySelectorAll('.lang-btn').forEach(function(btn) {
                    btn.textContent = locale === 'es' ? 'EN' : 'ES';
                });
            }

            /* ─── Init sequence ─── */
            // 1) Inicializar storage (IDB + migración desde localStorage) ANTES de
            //    cualquier lectura de config/tema/locale.
            window.FFPWA.storage.init().then(function() {
                // Re-aplicar tema y cache de config desde el storage ya migrado.
                if (window.FFPWA.theme && window.FFPWA.theme.syncFromStorage) {
                    window.FFPWA.theme.syncFromStorage();
                }
                if (window.FFPWA._initConfigCache) {
                    window.FFPWA._initConfigCache();
                }

                // 2) i18n → config → hide loading.
                window.initI18n(function(locale) {
                    document.documentElement.setAttribute('lang', locale);
                    updateLangBtn(locale);
                    window.initConfig();
                    hideLoadingScreen();
                });
            });

            // Fallback: esconder pantalla de carga después de 3.5s si algo falla en init
            setTimeout(hideLoadingScreen, 3500);

            // Initial online status
            window.FFPWA.updateStatus && window.FFPWA.updateStatus(
                navigator.onLine ? 'online' : 'offline'
            );

            // ── Consolidated global event listeners ──
            setupGlobalListeners();
        }

        boot();
    }

    // Si el DOM ya está ready (SW cache hit), ejecutar inmediatamente
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startBoot);
    } else {
        startBoot();
    }

})();