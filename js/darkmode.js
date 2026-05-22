/**
 * Dark Mode Manager
 *
 * Solo modos: light y dark.
 * Guarda preferencia en localStorage.
 * Corre inline para evitar flash de tema incorrecto.
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'ffpwa_theme';

    function getSavedTheme() {
        try {
            var val = localStorage.getItem(STORAGE_KEY);
            if (val === 'light' || val === 'dark') return val;
        } catch (e) {}
        return 'light';
    }

    function applyTheme(mode) {
        var html = document.documentElement;
        html.classList.remove('light', 'dark');
        html.classList.add(mode);
    }

    // ─── Init: ejecutar inmediatamente para evitar flash ───
    var currentTheme = getSavedTheme();
    applyTheme(currentTheme);

    // Actualizar íconos después de que el DOM esté listo
    function updateToggleIcon(mode) {
        var btns = document.querySelectorAll('.theme-toggle');
        btns.forEach(function(btn) {
            var icon = btn.querySelector('.theme-icon');
            if (!icon) return;
            icon.textContent = mode === 'dark' ? '☀️' : '🌙';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            updateToggleIcon(currentTheme);
        });
    } else {
        updateToggleIcon(currentTheme);
    }

    function cycleTheme() {
        var next = currentTheme === 'light' ? 'dark' : 'light';
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
        currentTheme = next;
        applyTheme(next);
        updateToggleIcon(next);
    }

    // ─── Exponer API ───
    window.FFPWA = window.FFPWA || {};
    window.FFPWA.theme = {
        getCurrent: function() { return currentTheme; },
        getSaved: getSavedTheme,
        setTheme: function(mode) {
            if (mode !== 'light' && mode !== 'dark') return;
            try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
            currentTheme = mode;
            applyTheme(mode);
            updateToggleIcon(mode);
        },
        cycle: cycleTheme
    };
})();
