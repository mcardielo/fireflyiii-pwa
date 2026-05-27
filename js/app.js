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
     * Detectar cambios en conectividad y propagarlos a la UI.
     */
    function setupConnectivityListeners() {
        if (!window.FFPWA) window.FFPWA = {};

        window.addEventListener('online', function() {
            console.log('🌐 Conexión restablecida.');
            window.FFPWA.updateStatus && window.FFPWA.updateStatus('online');
        });

        window.addEventListener('offline', function() {
            console.log('📡 Sin conexión. Usando caché local.');
            window.FFPWA.updateStatus && window.FFPWA.updateStatus('offline');
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

        var $badges = $('.online-status');
        if (state === 'offline') {
            $badges
                .removeClass('text-ios-green bg-ios-green-bg text-ios-red')
                .addClass('text-ios-orange bg-ios-orange-bg')
                .text(t('nav.offline', '● Offline'));
        } else if (state === 'server_down') {
            $badges
                .removeClass('text-ios-green bg-ios-green-bg text-ios-orange bg-ios-orange-bg')
                .addClass('text-ios-red bg-ios-orange-bg')
                .text(t('nav.server_down', '🔶 Servidor no disponible'));
        } else if (state === 'checking') {
            $badges
                .removeClass('text-ios-green bg-ios-green-bg text-ios-red')
                .addClass('text-ios-orange bg-ios-orange-bg')
                .text(t('nav.server_checking', '🔶 Verificando...'));
        } else {
            $badges
                .removeClass('text-ios-orange bg-ios-orange-bg text-ios-red')
                .addClass('text-ios-green bg-ios-green-bg')
                .text(t('nav.online', '● Online'));
        }
    };

    // Registrar SW inmediatamente (no esperar DOMReady)
    registerServiceWorker();
    setupConnectivityListeners();

    /*
     *  Boot de la app: montar UI restante, configurar pantallas, handlers.
     */
    $(function() {

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

        function boot() {
            if (typeof $ === 'undefined') {
                showOfflineFallback();
                return;
            }

            var $app = $('#app');

            // ── Montar templates --
            if (!$('#dashboard-container').length) {
                $app.append(document.getElementById('screen-setup').content.cloneNode(true));
                $app.append(document.getElementById('screen-account-picker').content.cloneNode(true));
                $app.append(document.getElementById('screen-record').content.cloneNode(true));
            }

            // ── Montar tab bar ──
            $app.append(
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
                '</div>'
            );

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
                if (firstEl && firstEl.id && $('#' + firstEl.id).length) return;
                var clone = content.cloneNode(true);
                var root = clone.firstElementChild;
                $app.append(clone);

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
                $('#lock-container').removeClass('hidden');
                $('#accounts-container').addClass('hidden');
                $('#tab-bar').addClass('hidden');

                $('#lock-pin-area').addClass('hidden');
                $('#lock-pin-error').addClass('hidden');
                $('#lock-loading').addClass('hidden');

                var method = window.FFPWA.auth.getMethod();
                var hasPin = window.FFPWA.auth.hasPin();

                if (method === 'webauthn' && !hasPin) {
                    $('#lock-btn-text').html(Icons.lockSm);
                } else if (method === 'webauthn' && hasPin) {
                    $('#lock-btn-text').html(Icons.lockSm + ' ' + (window.__ && window.__('lock.unlock_biometric') || 'Desbloquear con biometría'));
                    $('#lock-pin-area').removeClass('hidden');
                } else {
                    $('#lock-btn-text').addClass('hidden');
                    $('#lock-pin-area').removeClass('hidden');
                }

                if (window.i18nTranslateDOM) window.i18nTranslateDOM();
            }

            function hideLockScreen() {
                $('#lock-container').addClass('hidden');
                pendingScreen = null;
            }

            function handleUnlockSuccess() {
                var target = pendingScreen || 'accounts';
                hideLockScreen();
                window.FFPWA.auth.unlocked = true;
                pendingScreen = null;

                if (target === 'accounts') {
                    $('#accounts-container').removeClass('hidden');
                    if (window.FFPWA.showAccountsScreen) window.FFPWA.showAccountsScreen();
                } else if (target === 'history') {
                    $('#history-container').removeClass('hidden');
                    if (window.FFPWA.showHistoryScreen) window.FFPWA.showHistoryScreen();
                }

                $('#tab-bar').removeClass('hidden');
            }

            /* ─── Tab switching ─── */
            function switchTab(screen) {
                var hidden = '#setup-container, #default-account-container, #dashboard-container, #accounts-container, #history-container, #lock-container';
                $(hidden).addClass('hidden');

                if (screen === 'record') {
                    $('#dashboard-container').removeClass('hidden');
                } else if (screen === 'accounts') {
                    window.mountScreen('screen-accounts');
                    if (window.FFPWA.auth && window.FFPWA.auth.needsAuth()) {
                        showLockScreen('accounts');
                    } else {
                        $('#accounts-container').removeClass('hidden');
                        if (window.FFPWA.showAccountsScreen) window.FFPWA.showAccountsScreen();
                    }
                } else if (screen === 'history') {
                    window.mountScreen('screen-history');
                    if (window.FFPWA.auth && window.FFPWA.auth.needsAuth()) {
                        showLockScreen('history');
                    } else {
                        $('#history-container').removeClass('hidden');
                        if (window.FFPWA.showHistoryScreen) window.FFPWA.showHistoryScreen();
                    }
                }

                $('#tab-bar .tab-btn').removeClass('active');
                $('#tab-bar .tab-btn[data-screen="' + screen + '"]').addClass('active');
                $('#tab-bar').removeClass('hidden');

                if (!navigator.onLine) {
                    window.FFPWA.updateStatus('offline');
                }
                if (window.i18nTranslateDOM) window.i18nTranslateDOM();
            }

            window.switchTab = switchTab;

            /* ─── Event handlers ─── */
            $(document).on('click', '#lock-cancel-btn', function() {
                hideLockScreen();
                switchTab('record');
            });

            $(document).on('click', '#lock-unlock-btn', function() {
                var method = window.FFPWA.auth.getMethod();
                $('#lock-loading').removeClass('hidden');

                window.FFPWA.auth.unlock(method).then(function(success) {
                    $('#lock-loading').addClass('hidden');
                    if (success) {
                        handleUnlockSuccess();
                    } else {
                        if (window.FFPWA.auth.hasPin()) {
                            $('#lock-pin-area').removeClass('hidden');
                            $('#lock-btn-text').html(Icons.lockSm + ' ' + 'Usar PIN');
                        }
                    }
                });
            });

            $(document).on('input', '#lock-pin-input', function() {
                var pin = $(this).val();
                if (pin.length >= 4) {
                    $('#lock-pin-error').addClass('hidden');
                    window.FFPWA.auth.verifyPin(pin).then(function(valid) {
                        if (valid) {
                            handleUnlockSuccess();
                        } else {
                            $('#lock-pin-error').removeClass('hidden');
                            $('#lock-pin-input').val('');
                        }
                    });
                }
            });

            $(document).on('click', '#tab-bar .tab-btn', function() {
                var screen = $(this).data('screen');
                if ($(this).hasClass('active')) return;
                switchTab(screen);
            });

            $(document).on('click', '.lang-btn', function() {
                var current = window.getLocale();
                var next = current === 'es' ? 'en' : 'es';
                window.setLocale(next).then(function() {
                    $('html').attr('lang', next);
                    updateLangBtn(next);
                });
            });

            function updateLangBtn(locale) {
                $('.lang-btn').text(locale === 'es' ? 'EN' : 'ES');
            }

            /* ─── Init sequence ─── */
            window.initI18n(function(locale) {
                $('html').attr('lang', locale);
                updateLangBtn(locale);
                window.initConfig();
                hideLoadingScreen();
            });

            // Fallback: esconder pantalla de carga después de 3 segundos si algo falla en init
            setTimeout(hideLoadingScreen, 3000);

            // Initial online status
            window.FFPWA.updateStatus && window.FFPWA.updateStatus(
                navigator.onLine ? 'online' : 'offline'
            );
        }

        boot();
    });

})();
