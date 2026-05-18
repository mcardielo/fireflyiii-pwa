/**
 * i18n.js — Lightweight i18n engine for Firefly PWA
 *
 * Usage:
 *   __('app.title')                          → "Configuración"
 *   __('sync.progress', {count: 3})          → "Sincronizando 3 transacciones..."
 *
 * HTML: <h1 data-i18n="app.title">Fallback</h1>
 * Call i18nTranslateDOM() after dynamic content changes.
 *
 * Events:
 *   $(window).on('localeChanged', function(e, newLocale) { ... })
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'firefly_locale';
    var DEFAULT_LOCALE = 'es';
    var FALLBACK_LOCALE = 'en';

    var currentLocale = null;
    var translations = {};
    var pendingCallbacks = [];

    /* ─── Public API ─── */

    /**
     * Get a translated string by key.
     * @param {string} key - Dot-notation key (e.g. "app.title")
     * @param {Object} [vars] - Optional interpolation vars, e.g. {name: "MXN"}
     * @returns {string} Translated string, or the key itself if not found
     */
    window.__ = function __(key, vars) {
        if (!key) return '';
        if (translations[key] !== undefined && translations[key] !== null) {
            var str = translations[key];
            if (vars && typeof vars === 'object') {
                for (var k in vars) {
                    if (vars.hasOwnProperty(k)) {
                        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
                    }
                }
            }
            return str;
        }
        // Fallback to key name as last resort
        return key;
    };

    /**
     * Switch locale and reload translations.
     * Resolves when translations are loaded and DOM is updated.
     * @param {string} locale - e.g. "en", "es"
     * @returns {Promise}
     */
    window.setLocale = function setLocale(locale) {
        if (locale === currentLocale && translations && Object.keys(translations).length > 0) {
            return Promise.resolve();
        }
        return loadLocale(locale).then(function() {
            localStorage.setItem(STORAGE_KEY, locale);
            currentLocale = locale;
            i18nTranslateDOM();
            $(window).trigger('localeChanged', [locale]);
            // Fire pending callbacks from init
            while (pendingCallbacks.length) {
                pendingCallbacks.shift()(locale);
            }
        });
    };

    /**
     * Get current locale code.
     * @returns {string}
     */
    window.getLocale = function getLocale() {
        return currentLocale || DEFAULT_LOCALE;
    };

    /**
     * Init i18n system: detect locale, load translations, translate DOM.
     * Returns a Promise resolved when ready.
     * @param {Function} [callback] - Optional callback(locale) called when translations are loaded.
     * @returns {Promise}
     */
    window.initI18n = function initI18n(callback) {
        var detected = detectLocale();

        if (callback) {
            pendingCallbacks.push(callback);
        }

        return loadLocale(detected).then(function() {
            currentLocale = detected;
            i18nTranslateDOM();
            $(window).trigger('localeChanged', [detected]);
            while (pendingCallbacks.length) {
                pendingCallbacks.shift()(detected);
            }
        }).catch(function() {
            // Fallback to default on error
            console.warn('[i18n] Falló carga de locale, usando default:', DEFAULT_LOCALE);
            currentLocale = DEFAULT_LOCALE;
        });
    };

    /**
     * Re-scan DOM for [data-i18n] elements and update their text.
     * Call after dynamically inserting HTML with data-i18n attributes.
     */
    window.i18nTranslateDOM = function i18nTranslateDOM() {
        if (typeof $ === 'undefined') return;
        $('[data-i18n]').each(function() {
            var $el = $(this);
            var key = $el.data('i18n');
            var text = window.__(key);
            if (text !== key) {
                $el.text(text);
            }
        });
        // Also update placeholder translations
        $('[data-i18n-placeholder]').each(function() {
            var $el = $(this);
            var key = $el.data('i18n-placeholder');
            var text = window.__(key);
            if (text !== key) {
                $el.attr('placeholder', text);
            }
        });
    };

    /* ─── Internal ─── */

    function detectLocale() {
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
        var navLang = (navigator.language || navigator.userLanguage || '').substring(0, 2);
        if (navLang === 'en' || navLang === 'es') return navLang;
        return DEFAULT_LOCALE;
    }

    function loadLocale(locale) {
        var langFile = 'lang/' + locale + '.json';
        return new Promise(function(resolve, reject) {
            $.ajax({
                url: langFile,
                dataType: 'json',
                cache: true,
                success: function(data) {
                    translations = data || {};
                    resolve();
                },
                error: function(xhr, status, err) {
                    console.error('[i18n] Error cargando', langFile, err);
                    // Try fallback locale if not already trying it
                    if (locale !== FALLBACK_LOCALE) {
                        loadLocale(FALLBACK_LOCALE).then(resolve).catch(reject);
                    } else {
                        translations = {};
                        reject(err);
                    }
                }
            });
        });
    }

})();
