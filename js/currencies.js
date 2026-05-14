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
            $.ajax({
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
                    let msg = 'Error al cargar monedas';
                    if (xhr.status === 0) msg += ' (sin conexión)';
                    reject(new Error(msg));
                }
            });
        });
    }

    /* ───────── Inicialización ───────── */

    function populateCurrencyDropdown() {
        const $select = $('#currency-select');
        if (!$select.length) return;

        const enabled = window.FFPWA.currencies.enabled;
        const primaryCode = window.FFPWA.currencies.primary
            ? window.FFPWA.currencies.primary.code
            : '';

        $select.empty();
        enabled.forEach(c => {
            const label = `${c.symbol} ${c.code} — ${c.name}`;
            $select.append(`<option value="${c.code}" ${c.code === primaryCode ? 'selected' : ''}>${label}</option>`);
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

        console.log(`[CURRENCIES] Primaria: ${window.FFPWA.currencies.primary.code}, Habilitadas: ${window.FFPWA.currencies.enabled.length}`);

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
     * Primero revisa caché, si no hay o está vieja, consulta Frankfurter API.
     * @param {string} fromCurrency - Código de moneda origen (ej: USD)
     * @param {string} toCurrency - Código de moneda destino (ej: MXN)
     * @returns {Promise<{rate: number, date: string}>}
     */
    function getExchangeRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) {
            return Promise.resolve({ rate: 1, date: new Date().toISOString().split('T')[0] });
        }

        // Intentar fetch siempre (Fí­sica online)
        return fetchExchangeRateFromFrankfurter(fromCurrency, toCurrency)
            .then(rateInfo => {
                cacheRate(fromCurrency, toCurrency, rateInfo);
                return rateInfo;
            })
            .catch(() => {
                // Fallback: usar caché si existe
                const cached = getCachedRate(fromCurrency, toCurrency);
                if (cached) {
                    console.warn(`[RATES] Usando tasa cacheada ${fromCurrency}→${toCurrency} del ${cached.date}`);
                    return { rate: cached.rate, date: cached.date };
                }
                throw new Error(`No hay tasa disponible para ${fromCurrency} → ${toCurrency}`);
            });
    }
    window.FFPWA.getExchangeRate = getExchangeRate;

    function fetchExchangeRateFromFrankfurter(from, to) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
                method: 'GET',
                dataType: 'json',
                timeout: 10000,
                success: function(data) {
                    if (data.rates && data.rates[to]) {
                        resolve({ rate: data.rates[to], date: data.date });
                    } else {
                        reject(new Error(`Sin tasa ${from}→${to} en Frankfurter`));
                    }
                },
                error: function() {
                    reject(new Error('Frankfurter API no disponible'));
                }
            });
        });
    }

    /* ───────── UI: Indicador de tasa ───────── */

    function updateRateDisplay() {
        const selectedCurrency = $('#currency-select').val();
        const primaryCurrency = window.FFPWA.currencies.primary;
        const $rateDisplay = $('#exchange-rate-display');
        const $rateInfo = $('#exchange-rate-info');

        if (!$rateInfo.length) return;

        if (!selectedCurrency || !primaryCurrency || selectedCurrency === primaryCurrency.code) {
            $rateInfo.addClass('hidden');
            return;
        }

        // Mostrar estado de carga
        $rateInfo.removeClass('hidden');
        $rateDisplay.text('Obteniendo tipo de cambio...');

        getExchangeRate(selectedCurrency, primaryCurrency.code)
            .then(rateInfo => {
                $rateDisplay.text(
                    `Tasa: 1 ${selectedCurrency} = ${rateInfo.rate.toFixed(4)} ${primaryCurrency.code} (${rateInfo.date})`
                );
                recalcAmountDisplay();
            })
            .catch(err => {
                $rateDisplay.text(`⚠ ${err.message}`);
            });
    }

    function recalcAmountDisplay() {
        const $amount = $('#amount');
        const $converted = $('#amount-converted');
        const selectedCurrency = $('#currency-select').val();
        const primaryCurrency = window.FFPWA.currencies.primary;

        if (!$converted.length || !selectedCurrency || selectedCurrency === primaryCurrency.code) {
            return;
        }

        const rawAmount = $amount.val().trim();
        if (!rawAmount || isNaN(parseFloat(rawAmount))) {
            $converted.addClass('hidden');
            return;
        }

        const amount = parseFloat(rawAmount);
        const rateInfo = getCachedRate(selectedCurrency, primaryCurrency.code) ||
                         { rate: 1, date: '' };

        const converted = (amount * rateInfo.rate).toFixed(primaryCurrency.decimal_places || 2);
        $converted.removeClass('hidden');
        $converted.text(
            `= ${converted} ${primaryCurrency.code}`
        );
    }

    function setupCurrencyChangeHandler() {
        $(document).on('change', '#currency-select', function() {
            updateRateDisplay();
        });

        $(document).on('input', '#amount', function() {
            recalcAmountDisplay();
        });
    }

    /* ───────── Punto de entrada ───────── */

    $(window).on('configLoaded', function() {
        const url = window.FFPWA.config.url;
        const token = window.FFPWA.config.token;

        // Cargar caché inmediatamente (offline)
        const cached = getCachedCurrencies();
        if (cached && cached.length > 0) {
            console.log('[CURRENCIES] Usando caché local.');
            initCurrencies(cached);
        }

        // Refrescar desde API (online)
        fetchCurrenciesFromApi(url, token)
            .then(currencies => {
                cacheCurrencies(currencies);
                initCurrencies(currencies);
            })
            .catch(err => {
                console.warn('[CURRENCIES]', err.message);
                if (!window.FFPWA.currencies.list.length) {
                    // Fallback: crear moneda por defecto
                    initCurrencies([{
                        code: 'MXN',
                        name: 'Peso Mexicano',
                        symbol: '$',
                        decimal_places: 2,
                        enabled: true,
                        primary: true
                    }]);
                }
            });
    });

})();
