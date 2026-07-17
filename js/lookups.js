/**
 * lookups.js — Fetch + caché offline de categories y budgets.
 * Patrón idéntico a accounts.js: stale-while-revalidate via localStorage.
 * Reutilizable por el formulario de registro Y el de edición.
 */
(function() {
    'use strict';

    const CATEGORIES_CACHE_KEY = 'firefly_categories_cache';
    const BUDGETS_CACHE_KEY = 'firefly_budgets_cache';

    window.FFPWA = window.FFPWA || {};

    /* ─── Categorías ─── */

    function getCachedCategories() {
        try {
            var raw = localStorage.getItem(CATEGORIES_CACHE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function cacheCategories(categories) {
        try {
            localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(categories));
            console.log('✅ [CACHE]: Categorías cacheadas (' + categories.length + ')');
        } catch (e) {
            console.error('❌ [CACHE]: Error al cachear categorías', e);
        }
    }

    function fetchCategories() {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;
        return new Promise(function(resolve, reject) {
            window.FFPWA.http({
                url: url + '/api/v1/autocomplete/categories',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 10000,
                success: function(data) {
                    var clean = (data || []).map(function(c) {
                        return { id: c.id, name: c.name };
                    });
                    cacheCategories(clean);
                    window.FFPWA.categoriesCache = clean;
                    resolve(clean);
                },
                error: function(xhr) {
                    reject(new Error('HTTP ' + xhr.status));
                }
            });
        });
    }

    /**
     * Devuelve categorías del caché inmediatamente.
     * Si hay red, refresca en background (stale-while-revalidate).
     */
    function getCategories() {
        var cached = getCachedCategories();
        window.FFPWA.categoriesCache = cached;
        if (navigator.onLine && window.FFPWA.config.url) {
            fetchCategories().catch(function(e) {
                console.warn('⚠️ [LOOKUPS]: No se pudo refrescar categorías:', e.message);
            });
        }
        return cached;
    }

    /* ─── Budgets ─── */

    function getCachedBudgets() {
        try {
            var raw = localStorage.getItem(BUDGETS_CACHE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function cacheBudgets(budgets) {
        try {
            localStorage.setItem(BUDGETS_CACHE_KEY, JSON.stringify(budgets));
            console.log('✅ [CACHE]: Budgets cacheados (' + budgets.length + ')');
        } catch (e) {
            console.error('❌ [CACHE]: Error al cachear budgets', e);
        }
    }

    function fetchBudgets() {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;
        return new Promise(function(resolve, reject) {
            window.FFPWA.http({
                url: url + '/api/v1/autocomplete/budgets',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 10000,
                success: function(data) {
                    var clean = (data || []).map(function(b) {
                        return { id: b.id, name: b.name };
                    });
                    cacheBudgets(clean);
                    window.FFPWA.budgetsCache = clean;
                    resolve(clean);
                },
                error: function(xhr) {
                    reject(new Error('HTTP ' + xhr.status));
                }
            });
        });
    }

    /**
     * Devuelve budgets del caché inmediatamente.
     * Si hay red, refresca en background (stale-while-revalidate).
     */
    function getBudgets() {
        var cached = getCachedBudgets();
        window.FFPWA.budgetsCache = cached;
        if (navigator.onLine && window.FFPWA.config.url) {
            fetchBudgets().catch(function(e) {
                console.warn('⚠️ [LOOKUPS]: No se pudo refrescar budgets:', e.message);
            });
        }
        return cached;
    }

    /* ─── API pública ─── */

    window.FFPWA.lookups = {
        getCategories: getCategories,
        fetchCategories: fetchCategories,
        getCachedCategories: getCachedCategories,
        getBudgets: getBudgets,
        fetchBudgets: fetchBudgets,
        getCachedBudgets: getCachedBudgets
    };

})();