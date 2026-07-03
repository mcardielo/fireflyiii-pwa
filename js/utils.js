/**
 * utils.js — Shared helpers for Firefly PWA
 * Single source of truth for formatting and escaping functions.
 */
(function() {
    'use strict';

    /**
     * Escape HTML special characters to prevent XSS.
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Format a date string for display.
     * Uses locale-aware formatting with fallback.
     */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        var locale = window.getLocale ? window.getLocale() : 'es';
        try {
            return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (e) {
            return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
        }
    }

    /**
     * Format a monetary amount with currency symbol.
     */
    function formatMoney(amount, symbol, decimals) {
        if (amount === undefined || amount === null) amount = 0;
        var negative = amount < 0;
        var formatted = Math.abs(Number(amount)).toFixed(decimals);
        var parts = formatted.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (negative ? '-' : '') + (symbol || '$') + ' ' + parts.join('.');
    }

    /**
     * Captura la ubicación GPS del dispositivo.
     * @returns {Promise<{latitude:number,longitude:number,zoom_level:number}|null>}
     */
    function getLocation() {
        return new Promise(function(resolve) {
            if (!navigator.geolocation) {
                console.log('📍 Geolocation no disponible en este navegador.');
                resolve(null);
                return;
            }

            var watchId = null;
            var timeoutId = null;
            var resolved = false;

            function done(result) {
                if (resolved) return;
                resolved = true;
                if (watchId !== null) navigator.geolocation.clearWatch(watchId);
                if (timeoutId !== null) clearTimeout(timeoutId);
                resolve(result);
            }

            // Timeout de seguridad: 15 segundos
            timeoutId = setTimeout(function() {
                console.warn('📍 Geolocation timeout después de 15s');
                done(null);
            }, 15000);

            // watchPosition sigue escuchando hasta que CoreLocation da fix
            watchId = navigator.geolocation.watchPosition(
                function(position) {
                    var loc = {
                        latitude: parseFloat(position.coords.latitude.toFixed(6)),
                        longitude: parseFloat(position.coords.longitude.toFixed(6)),
                        zoom_level: 16
                    };
                    console.log('📍 Ubicación capturada:', loc.latitude, loc.longitude);
                    done(loc);
                },
                function(err) {
                    console.warn('📍 Geolocation error:', err.message);
                    // Solo resolver con null si es PERMISSION_DENIED (fatal)
                    // Para POSITION_UNAVAILABLE o TIMEOUT, watchPosition sigue intentando
                    if (err.code === 1) { // PERMISSION_DENIED
                        done(null);
                    }
                },
                {
                    enableHighAccuracy: false,
                    maximumAge: 60000
                }
            );
        });
    }

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.escapeHtml = escapeHtml;
    window.FFPWA.formatDate = formatDate;
    window.FFPWA.formatMoney = formatMoney;
    window.FFPWA.getLocation = getLocation;

})();
