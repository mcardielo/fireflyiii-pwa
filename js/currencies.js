(function() {
    'use strict';

    const CURRENCIES_CACHE_KEY = 'firefly_currencies_cache';
    const RATES_CACHE_KEY = 'firefly_exchange_rates';

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.currencies = {
        list: [],
        primary: null,
        enabled: []
    };

    /* ───────── Cache de monedas ───────── */

    function getCachedCurrencies() {
        try {
            const data = localStorage.getItem(CURRENCIES_CACHE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    function cacheCurrencies(currencies) {
        try {
            localStorage.setItem(CURRENCIES_CACHE_KEY, JSON.stringify(currencies));
        } catch (e) {
            console.warn('[CURRENCIES] Error al cachear:', e);
        }
    }

    function fetchCurrenciesFromApi(url, token) {
        return new Promise((resolve, reject) => {
            window.FFPWA.http({
                url: `${url}/api/v1/currencies?limit=1000`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                success: function(response) {
                    const raw = response.data || [];
                    const processed = raw.map(c => ({
                        code: c.attributes.code,
                        name: c.attributes.name,
                        symbol: c.attributes.symbol,
                        decimal_places: c.attributes.decimal_places || 2,
                        enabled: c.attributes.enabled,
                        primary: c.attributes.primary !== undefined
                            ? c.attributes.primary
                            : c.attributes.default
                    }));
                    resolve(processed);
                },
                error: function(xhr) {
                    let msg = __('currency.error_fetch');
                    if (xhr.status === 0) msg += __('currency.error_no_connection');
                    reject(new Error(msg));
                }
            });
        });
    }

    /* ───────── Inicialización ───────── */

    function populateCurrencyDropdown() {
        const select = document.getElementById('currency-select');
        if (!select) return;

        const enabled = window.FFPWA.currencies.enabled;
        const primaryCode = window.FFPWA.currencies.primary
            ? window.FFPWA.currencies.primary.code
            : '';

        select.innerHTML = '';
        enabled.forEach(c => {
            const label = c.code;
            const opt = document.createElement('option');
            opt.value = c.code;
            if (c.code === primaryCode) opt.selected = true;
            opt.textContent = label;
            select.appendChild(opt);
        });
    }

    function initCurrencies(currenciesData) {
        if (!currenciesData || currenciesData.length === 0) {
            console.warn('[CURRENCIES] Sin datos de monedas.');
            return;
        }

        window.FFPWA.currencies.list = currenciesData;
        window.FFPWA.currencies.primary = currenciesData.find(c => c.primary) || currenciesData[0];
        window.FFPWA.currencies.enabled = currenciesData.filter(c => c.enabled);

        console.log('[CURRENCIES] ' + __('resource.currencies_loaded', {
            primary: window.FFPWA.currencies.primary.code,
            enabled: window.FFPWA.currencies.enabled.length
        }));

        populateCurrencyDropdown();
        setupCurrencyChangeHandler();

        // Actualizar indicador de tasa inicial
        updateRateDisplay();
    }
    window.FFPWA.initCurrencies = initCurrencies;

    /* ───────── Tipo de cambio (Frankfurter API) ───────── */

    function getRateCacheKey(from, to) {
        return `rate_${from}_${to}`;
    }

    function getCachedRate(from, to) {
        try {
            const stored = localStorage.getItem(RATES_CACHE_KEY);
            if (!stored) return null;
            const allRates = JSON.parse(stored);
            const data = allRates[getRateCacheKey(from, to)];
            return data ? { rate: data.rate, date: data.date } : null;
        } catch (e) {
            return null;
        }
    }
    window.FFPWA.getCachedRate = getCachedRate;

    function cacheRate(from, to, rateInfo) {
        try {
            const stored = localStorage.getItem(RATES_CACHE_KEY);
            const allRates = stored ? JSON.parse(stored) : {};
            allRates[getRateCacheKey(from, to)] = {
                rate: rateInfo.rate,
                date: rateInfo.date,
                fetchedAt: new Date().toISOString()
            };
            localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(allRates));
        } catch (e) {
            console.warn('[RATES] Error cacheando tasa:', e);
        }
    }

    /**
     * Obtiene la tasa de cambio de fromCurrency a toCurrency (1 from = X to).
     * Cache-first: si hay tasa del día de hoy, la usa,
     * si no hay o está vieja, consulta Frankfurter.
     * Deduplica requests en vuelo para el mismo par.
     * @param {string} fromCurrency - Código de moneda origen (ej: USD)
     * @param {string} toCurrency - Código de moneda destino (ej: MXN)
     * @returns {Promise<{rate: number, date: string}>}
     */
    var _pendingRateRequests = {};

    function getExchangeRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) {
            return Promise.resolve({ rate: 1, date: new Date().toISOString().split('T')[0] });
        }

        var pairKey = fromCurrency + '_' + toCurrency;

        // Dedup: si ya hay un request en vuelo para este par, devolver esa misma promesa
        if (_pendingRateRequests[pairKey]) {
            console.log('[RATES] Dedup: usando request en vuelo para ' + fromCurrency + '→' + toCurrency);
            return _pendingRateRequests[pairKey];
        }

        // Cache-first: si tenemos tasa fresca de hoy, usarla
        var cached = getCachedRate(fromCurrency, toCurrency);
        var today = new Date().toISOString().split('T')[0];
        if (cached && cached.date === today) {
            console.log('[RATES] Cache-fresh: ' + fromCurrency + '→' + toCurrency + ' = ' + cached.rate + ' (' + cached.date + ')');
            return Promise.resolve({ rate: cached.rate, date: cached.date });
        }

        // Fetch de la API
        var request = fetchExchangeRateFromFrankfurter(fromCurrency, toCurrency)
            .then(function(rateInfo) {
                cacheRate(fromCurrency, toCurrency, rateInfo);
                delete _pendingRateRequests[pairKey];
                return rateInfo;
            })
            .catch(function(err) {
                delete _pendingRateRequests[pairKey];
                // Fallback: cualquier tasa cacheada (aunque vieja)
                if (cached) {
                    console.warn('[RATES] Usando tasa cacheada vieja ' + fromCurrency + '→' + toCurrency + ' del ' + cached.date);
                    return { rate: cached.rate, date: cached.date };
                }
                throw err;
            });

        _pendingRateRequests[pairKey] = request;
        return request;
    }
    window.FFPWA.getExchangeRate = getExchangeRate;

    function fetchExchangeRateFromFrankfurter(from, to) {
        return new Promise((resolve, reject) => {
            window.FFPWA.http({
                url: `https://api.frankfurter.dev/v2/rate/${from}/${to}`,
                method: 'GET',
                dataType: 'json',
                timeout: 10000,
                success: function(data) {
                    if (data.rate) {
                        resolve({ rate: data.rate, date: data.date });
                    } else {
                        reject(new Error(__('currency.error_frankfurter', { from: from, to: to })));
                    }
                },
                error: function() {
                    reject(new Error(__('currency.error_frankfurter_down')));
                }
            });
        });
    }

    /* ───────── UI: Indicador de tasa ───────── */

    function updateRateDisplay() {
        const selectedCurrency = document.getElementById('currency-select') ? document.getElementById('currency-select').value : '';
        const primaryCurrency = window.FFPWA.currencies.primary;
        const rateDisplay = document.getElementById('exchange-rate-display');
        const rateInfo = document.getElementById('exchange-rate-info');

        if (!rateInfo) return;

        if (!selectedCurrency || !primaryCurrency || selectedCurrency === primaryCurrency.code) {
            rateInfo.classList.add('hidden');
            return;
        }

        // Mostrar estado de carga
        rateInfo.classList.remove('hidden');
        if (rateDisplay) rateDisplay.textContent = __('currency.loading_rate');

        getExchangeRate(selectedCurrency, primaryCurrency.code)
            .then(rateInfo => {
                if (rateDisplay) rateDisplay.textContent = __('currency.rate_display', {
                    from: selectedCurrency,
                    rate: rateInfo.rate.toFixed(4),
                    to: primaryCurrency.code,
                    date: rateInfo.date
                });
                recalcAmountDisplay();
            })
            .catch(err => {
                if (rateDisplay) rateDisplay.textContent = __('currency.rate_error', { message: err.message });
            });
    }

    function recalcAmountDisplay() {
        const amountEl = document.getElementById('amount');
        const convertedEl = document.getElementById('amount-converted');
        const currencySelect = document.getElementById('currency-select');
        const selectedCurrency = currencySelect ? currencySelect.value : '';
        const primaryCurrency = window.FFPWA.currencies.primary;

        if (!convertedEl || !selectedCurrency || !primaryCurrency || selectedCurrency === primaryCurrency.code) {
            return;
        }

        const rawAmount = amountEl ? amountEl.value.trim() : '';
        if (!rawAmount || isNaN(parseFloat(rawAmount))) {
            convertedEl.classList.add('hidden');
            return;
        }

        const amount = parseFloat(rawAmount);
        const rateInfo = getCachedRate(selectedCurrency, primaryCurrency.code) ||
                         { rate: 1, date: '' };

        const converted = (amount * rateInfo.rate).toFixed(primaryCurrency.decimal_places || 2);
        convertedEl.classList.remove('hidden');
        convertedEl.textContent = __('currency.converted_display', {
            amount: converted,
            code: primaryCurrency.code
        });
    }

    var _currencyHandlerInitialized = false;

    function setupCurrencyChangeHandler() {
        if (_currencyHandlerInitialized) return;
        _currencyHandlerInitialized = true;

        var _rateDebounceTimer;
        document.addEventListener('change', function(e) {
            if (e.target && e.target.id === 'currency-select') {
                // Debounce 400ms: si el usuario cambia rápido de moneda,
                // solo se dispara una llamada a la API
                clearTimeout(_rateDebounceTimer);
                _rateDebounceTimer = setTimeout(function() {
                    updateRateDisplay();
                }, 400);
            }
        });

        document.addEventListener('input', function(e) {
            if (e.target && e.target.id === 'amount') {
                recalcAmountDisplay();
            }
        });
    }

    /* ───────── Punto de entrada ───────── */

    window.FFPWA._initCurrenciesOnConfigLoaded = function() {
        const url = window.FFPWA.config.url;
        const token = window.FFPWA.config.token;

        // Cargar caché inmediatamente (offline)
        const cached = getCachedCurrencies();
        if (cached && cached.length > 0) {
            console.log('[CURRENCIES] ' + __('resource.currencies_cache'));
            initCurrencies(cached);
        }

        // Después de poblar el dropdown, re-aplicar moneda de la cuenta default
        // (accounts.js ya seteo select.value pero el select estaba vacío)
        reapplyAccountCurrency();

        // Refrescar desde API (online)
        fetchCurrenciesFromApi(url, token)
            .then(currencies => {
                cacheCurrencies(currencies);
                initCurrencies(currencies);
                reapplyAccountCurrency();
            })
            .catch(err => {
                console.warn('[CURRENCIES]', err.message);
                if (!window.FFPWA.currencies.list.length) {
                    // Fallback: crear moneda por defecto
                    initCurrencies([{
                        code: 'MXN',
                        name: __('currency.default_name_mxn'),
                        symbol: '$',
                        decimal_places: 2,
                        enabled: true,
                        primary: true
                    }]);
                    reapplyAccountCurrency();
                }
            });
    };

    /* ─── Re-aplicar moneda de cuenta default después de poblar dropdown ─── */
    function reapplyAccountCurrency() {
        var typeEl = document.getElementById('transaction-type');
        var transactionType = typeEl ? typeEl.value : 'withdrawal';
        var defaultAccount = window.FFPWA.config && window.FFPWA.config.defaultSourceAccount;
        if (!defaultAccount || !defaultAccount.id) return;
        var { target } = window.FFPWA.getDefaultField(transactionType);
        var targetIdEl = document.getElementById(target + '-account-id');
        if (targetIdEl && targetIdEl.value) {
            var select = document.getElementById('currency-select');
            var cache = window.FFPWA.accountsCache;
            if (cache && select) {
                var account = cache.find(function(a) { return String(a.id) === String(targetIdEl.value); });
                if (account && account.currency_code && select.value !== account.currency_code) {
                    select.value = account.currency_code;
                    select.dispatchEvent(new Event('change'));
                }
            }
        }
    }

})();
