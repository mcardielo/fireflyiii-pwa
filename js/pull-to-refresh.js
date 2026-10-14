/**
 * pull-to-refresh.js — Gesture "tira para actualizar" reutilizable.
 *
 * Se conecta a un contenedor scrollable y dispara `onRefresh(done)` cuando el
 * usuario arrastra hacia abajo desde el tope y supera el umbral.
 *
 * Uso:
 *   window.FFPWA.enablePullToRefresh(scrollEl, function(done) {
 *       // refrescar...
 *       myRefresh().then(done, done);
 *   });
 *
 * - Idempotente: si ya fue conectado a ese elemento, no se vuelve a conectar.
 * - El indicador (spinner) se inyecta al inicio del contenedor.
 */
(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    var THRESHOLD = 70;  // px de arrastre para disparar
    var MAX_HEIGHT = 80; // altura máxima del indicador al arrastrar

    window.FFPWA.enablePullToRefresh = function(scrollEl, onRefresh) {
        if (!scrollEl || scrollEl.__ptrEnabled) return;
        scrollEl.__ptrEnabled = true;

        // Indicador (solo leyenda) al tope del contenedor.
        var indicator = document.createElement('div');
        indicator.className = 'ptr-indicator';
        indicator.style.cssText =
            'height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;' +
            'gap:10px;transition:height .18s ease;';
        indicator.innerHTML =
            '<span class="ptr-label" style="font-size:13px;color:var(--ios-text-secondary);"></span>';
        var label = indicator.querySelector('.ptr-label');
        scrollEl.insertBefore(indicator, scrollEl.firstChild);

        function t(key, fallback) {
            if (typeof window.__ === 'function') {
                var val = window.__(key);
                return val !== key ? val : fallback;
            }
            return fallback;
        }

        function setLabel(text) {
            if (label) label.textContent = text || '';
        }

        var startY = null;
        var pulling = false;
        var distance = 0;
        var refreshing = false;

        function setHeight(h) {
            indicator.style.height = h + 'px';
        }

        function reset() {
            pulling = false;
            distance = 0;
            startY = null;
            setHeight(0);
            setLabel('');
        }

        scrollEl.addEventListener('touchstart', function(e) {
            if (refreshing) return;
            if (scrollEl.scrollTop <= 0) {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        scrollEl.addEventListener('touchmove', function(e) {
            if (!pulling || refreshing) return;
            if (startY === null) return;
            var y = e.touches[0].clientY;
            var dy = y - startY;
            // Solo arrastre hacia abajo desde el tope.
            if (dy > 0 && scrollEl.scrollTop <= 0) {
                distance = dy;
                // Amortiguar el arrastre (factor 0.5) y limitar.
                var h = Math.min(dy * 0.5, MAX_HEIGHT);
                setHeight(h);
                // Leyenda según si ya pasó el umbral de disparo.
                setLabel(distance >= THRESHOLD ? t('ptr.release', 'Suelta para actualizar') : t('ptr.pull', 'Tira para actualizar'));
                e.preventDefault();
            }
        }, { passive: false });

        scrollEl.addEventListener('touchend', function() {
            if (!pulling || refreshing) return;
            if (distance >= THRESHOLD) {
                refreshing = true;
                setHeight(44);
                setLabel('');
                onRefresh(function done() {
                    refreshing = false;
                    reset();
                });
            } else {
                reset();
            }
        });
    };
})();
