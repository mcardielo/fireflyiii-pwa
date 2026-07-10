(function() {
    'use strict';

    const ACCOUNT_STORAGE_KEY = 'firefly_accounts_cache';

    window.FFPWA = window.FFPWA || {};

    function hideDropdown(element) {
        var el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;
        el.classList.remove('visible');
        el.classList.add('hidden');
    }

    /**
     * Muestra el dropdown de autocomplete con posición fixed.
     */
    function showDropdown(element) {
        var dropdown = typeof element === 'string' ? document.querySelector(element) : element;
        if (!dropdown) return;
        var wrapper = dropdown.closest('.relative');
        var input = wrapper ? wrapper.querySelector('input') : null;
        if (!input) return;
        var rect = input.getBoundingClientRect();

        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';

        dropdown.classList.remove('hidden');
        dropdown.classList.add('visible');
    }

    /**
     * Devuelve el tipo de cuenta filtrado para un campo según el tipo de transacción.
     */
    function getAccountTypesForField(transactionType, fieldContext) {
        if (transactionType === 'deposit') {
            return fieldContext === 'source' ? ['revenue', 'liabilities'] : ['asset', 'liabilities'];
        }
        if (transactionType === 'transfer') {
            return ['asset'];
        }
        // withdrawal (default)
        return fieldContext === 'source' ? ['asset', 'liabilities'] : ['expense', 'liabilities'];
    }   
    window.FFPWA.getAccountTypesForField = getAccountTypesForField;


    function getCachedAccounts() {
        const cachedData = localStorage.getItem(ACCOUNT_STORAGE_KEY);
        return cachedData ? JSON.parse(cachedData) : null;
    }

    function fetchAccounts(url, token) {
        return new Promise((resolve, reject) => {
            window.FFPWA.http({
                url: `${url}/api/v1/accounts?type=all&limit=10000`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                success: function(data) {
                    const accounts = data.data || [];
                    const cleanAccounts = accounts.map(account => ({
                        id: account.id,
                        name: account.attributes.name,
                        type: account.attributes.type,
                        active: account.attributes.active !== undefined ? account.attributes.active : true,
                        currency_code: account.attributes.currency_code || null,
                        currency_decimal_places: account.attributes.currency_decimal_places || 2,
                        liability_type: account.attributes.liability_type || null,
                        liability_direction: account.attributes.liability_direction || null
                    }));

                    console.log('✅ [API]: ' + __('resource.accounts_loaded', { count: cleanAccounts.length }));
                    resolve(cleanAccounts);
                },
                error: function(xhr) {
                    console.error('❌ [API]: Error al cargar cuentas:', xhr.statusText);
                    let message = '';
                    if (xhr.status === 401) {
                        message = __('resource.accounts_token_error');
                    } else if (xhr.status !== 0) {
                        message = __('resource.accounts_connection_error', { detail: xhr.statusText });
                    } else {
                        message = __('resource.accounts_no_connection');
                    }
                    reject(new Error(message));
                }
            });
        });
    }

    function cacheAccounts(accounts) {
        try {
            localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
            console.log('✅ [CACHE]: ' + __('resource.accounts_cached'));
        } catch (e) {
            console.error('❌ [CACHE]: ' + __('resource.accounts_cache_error'), e);
        }
    }

    /**
     * Helper: setea los campos del formulario para source/destination.
     */
    function setAccountFields(field, name, id) {
        const prefix = field;
        var accEl = document.getElementById(`${prefix}-account`);
        var accNameEl = document.getElementById(`${prefix}-account-name`);
        var accIdEl = document.getElementById(`${prefix}-account-id`);
        if (accEl) accEl.value = name;
        if (accNameEl) accNameEl.value = name;
        if (accIdEl) accIdEl.value = id !== undefined && id !== null ? id : '';
    }

    /**
     * Devuelve qué campo dicta la moneda según el tipo de transacción.
     * - withdrawal/transfer: source
     * - deposit: destination
     * @returns {{ target: 'source'|'destination', other: 'source'|'destination' }}
     */
    window.FFPWA.getDefaultField = function(transactionType) {
        const isDeposit = transactionType === 'deposit';
        return {
            target: isDeposit ? 'destination' : 'source',
            other: isDeposit ? 'source' : 'destination'
        };
    };

    /**
     * Ajusta automáticamente el dropdown de moneda según la cuenta seleccionada.
     * Solo actúa si el field es el lado que dicta moneda para el tipo actual.
     */
    function autoSetCurrencyFromAccount(accountId, field, transactionType) {
        if (!accountId) return;
        const cache = window.FFPWA.accountsCache;
        if (!cache) return;
        const account = cache.find(a => String(a.id) === String(accountId));
        if (!account || !account.currency_code) return;

        const { target } = window.FFPWA.getDefaultField(transactionType);
        if (field !== target) return;

        const select = document.getElementById('currency-select');
        if (select && select.value !== account.currency_code) {
            select.value = account.currency_code;
            select.dispatchEvent(new Event('change'));
        }
    }

    /**
     * Selecciona una cuenta existente y actualiza los campos del formulario.
     */
    function selectExistingAccount(account, field) {
        const id = (account.id !== undefined && account.id !== null && !isNaN(account.id))
            ? account.id : '';

        setAccountFields(field, account.name, id);

        var typeEl = document.getElementById('transaction-type');
        const transactionType = typeEl ? typeEl.value : 'withdrawal';
        autoSetCurrencyFromAccount(id, field, transactionType);

        hideDropdown('#source-autocomplete');
        hideDropdown('#destination-autocomplete');
    }

    /**
     * Selecciona la opción para crear una cuenta nueva.
     */
    function selectNewAccount(newAccount, field) {
        setAccountFields(field, newAccount.name, '');

        window.FFPWA.showStatusMessage(__('status.new_account_warning', { field: field }), 'warning');

        hideDropdown('#source-autocomplete');
        hideDropdown('#destination-autocomplete');
    }

    /**
     * Filtra la lista de cuentas y muestra el dropdown de sugerencias.
     */
    function filterAndDisplayAccounts(e, inputElement, dropdownElement, fieldContext, cache) {
        const rawValue = inputElement.value.trim();
        const query = rawValue.toLowerCase();

        if (query.length < 2) {
            hideDropdown(dropdownElement);
            return;
        }

        var typeEl = document.getElementById('transaction-type');
        const transactionType = typeEl ? typeEl.value : 'withdrawal';
        const targetTypes = getAccountTypesForField(transactionType, fieldContext);

        const accountsToFilter = cache.filter(account =>
            targetTypes.includes(account.type) && account.active !== false
        );

        const filteredAccounts = accountsToFilter.filter(account =>
            account.name.toLowerCase().includes(query)
        );

        // Crear nueva cuenta: solo si NO hay SOLO asset ni liabilities (cuentas predefinidas)
        const hasPredefined = targetTypes.every(t => t === 'asset' || t === 'liabilities');
        const results = filteredAccounts.slice();
        if (!hasPredefined) {
            results.push({
                name: rawValue,
                id: undefined,
                isNew: true
            });
        }

        renderAutocomplete(dropdownElement, results);
        showDropdown(dropdownElement);
    }

    /**
     * Renderiza el dropdown de sugerencias.
     */
    function renderAutocomplete(dropdownEl, results) {
        if (typeof dropdownEl === 'string') dropdownEl = document.querySelector(dropdownEl);
        if (!dropdownEl) return;
        dropdownEl.innerHTML = '';

        let htmlContent = '';

        results.forEach(item => {
            const isNew = item.isNew || false;
            const escapeHtml = window.FFPWA.escapeHtml;
            const escapedName = escapeHtml(item.name);
            const escapedId = item.id !== undefined ? escapeHtml(String(item.id)) : '';
            const dataAttributes = `data-account-id="${escapedId}" data-account-name="${escapeHtml(item.name)}" data-is-new="${isNew}"`;

            htmlContent += `<li ${dataAttributes} class="autocomplete-item">
                <span>${escapedName}</span>
                ${isNew ? '<span class="new-badge">' + __('resource.create_new') + '</span>' : ''}
            </li>`;
        });

        dropdownEl.innerHTML = htmlContent;
    }

    /**
     * Configura el manejador de selección con mousedown (se dispara
     * antes del blur/change del input, evitando el doble clic).
     */
    function setupDropdownClickHandler(dropdownEl) {
        if (typeof dropdownEl === 'string') dropdownEl = document.querySelector(dropdownEl);
        if (!dropdownEl) return;

        dropdownEl.addEventListener('mousedown', function(e) {
            var item = e.target.closest('.autocomplete-item');
            if (!item) return;
            e.preventDefault(); // Evita que el input pierda foco antes de seleccionar

            var id = item.getAttribute('data-account-id');
            var name = item.getAttribute('data-account-name');
            var isNew = item.getAttribute('data-is-new') === 'true';

            var context = item.closest('.autocomplete-dropdown').id === 'source-autocomplete' ? 'source' : 'destination';

            if (isNew) {
                selectNewAccount({ name: name, isNew: true }, context);
            } else {
                selectExistingAccount({ id: parseInt(id), name: name }, context);
            }
        });
    }

    /**
     * Simple debounce utility.
     */
    function debounce(fn, delay) {
        let timer;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function() { fn.apply(context, args); }, delay);
        };
    }

    var autocompleteInitialized = false;

    function initAutocomplete(sourceInputId, sourceDropdownId, destInputId, destDropdownId, accountsCache) {
        const sourceInput = document.getElementById(sourceInputId);
        const sourceDropdown = document.getElementById(sourceDropdownId);
        const destInput = document.getElementById(destInputId);
        const destDropdown = document.getElementById(destDropdownId);

        if (!sourceInput || !sourceDropdown || !destInput || !destDropdown) return;

        // Evitar registrar listeners duplicados si initAutocomplete se llama otra vez
        if (autocompleteInitialized) return;
        autocompleteInitialized = true;

        const filterDebounced = debounce(function(e, input, dropdown, context) {
            filterAndDisplayAccounts(e, input, dropdown, context, window.FFPWA.accountsCache || accountsCache);
        }, 150);

        // Listener para el campo fuente (debounced en keyup, change solo si tiene foco)
        sourceInput.addEventListener('keyup', function(e) {
            filterDebounced(e, this, sourceDropdown, 'source');
        });
        sourceInput.addEventListener('change', function(e) {
            // Solo filtrar si el input tiene foco (evita re-abrir dropdown al perder foco por selección)
            if (document.activeElement === this) {
                filterAndDisplayAccounts(e, this, sourceDropdown, 'source', window.FFPWA.accountsCache || accountsCache);
            }
        });

        // Listener para el campo destino (debounced en keyup, change solo si tiene foco)
        destInput.addEventListener('keyup', function(e) {
            filterDebounced(e, this, destDropdown, 'destination');
        });
        destInput.addEventListener('change', function(e) {
            if (document.activeElement === this) {
                filterAndDisplayAccounts(e, this, destDropdown, 'destination', window.FFPWA.accountsCache || accountsCache);
            }
        });

        // Configurar los manejadores de clics delegados
        setupDropdownClickHandler(sourceDropdown);
        setupDropdownClickHandler(destDropdown);

        // Clic fuera del dropdown o al seleccionar un item, lo cierra
        document.addEventListener('click', function(e) {
            var target = e.target;
            if (!target.closest('.autocomplete-dropdown') &&
                !target.closest('#source-account, #destination-account')) {
                hideDropdown(sourceDropdown);
                hideDropdown(destDropdown);
            }
        });
    }

    /**
     * Coloca la cuenta default en el campo correspondiente según el tipo de transacción.
     * - withdrawal/transfer: default va en origen
     * - deposit: default va en destino
     */
    function prefillDefaultSource(accountsCache, transactionType) {
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;
        if (!defaultAccount || !defaultAccount.id) return;

        const match = accountsCache.find(a => String(a.id) === String(defaultAccount.id));
        if (!match) return;

        const { target, other } = window.FFPWA.getDefaultField(transactionType);

        // Limpiar el otro campo
        var otherAcc = document.getElementById(`${other}-account`);
        var otherAccId = document.getElementById(`${other}-account-id`);
        var otherAccName = document.getElementById(`${other}-account-name`);
        if (otherAcc) { otherAcc.value = ''; otherAcc.setAttribute('placeholder', __('accounts.placeholder_search', { field: other })); }
        if (otherAccId) otherAccId.value = '';
        if (otherAccName) otherAccName.value = '';

        // Poner default en targetField
        var targetAcc = document.getElementById(`${target}-account`);
        var targetAccId = document.getElementById(`${target}-account-id`);
        var targetAccName = document.getElementById(`${target}-account-name`);
        if (targetAcc) { targetAcc.value = ''; targetAcc.setAttribute('placeholder', __('accounts.placeholder_default', { name: match.name })); }
        if (targetAccId) targetAccId.value = match.id;
        if (targetAccName) targetAccName.value = match.name;

        // Auto-ajustar moneda según cuenta default
        autoSetCurrencyFromAccount(match.id, target, transactionType);

        console.log(`[DEFAULT] ${target} placeholder: ${match.name}`);
    }

    /**
     * Actualiza las etiquetas de tipo de cuenta según la transacción seleccionada.
     */
    function updateTypeHints(transactionType) {
        const sourceHint = document.getElementById('source-type-hint');
        const destHint = document.getElementById('dest-type-hint');

        if (transactionType === 'deposit') {
            if (sourceHint) sourceHint.textContent = __('transaction.hint_revenue');
            if (destHint) destHint.textContent = __('transaction.hint_asset');
        } else if (transactionType === 'transfer') {
            if (sourceHint) sourceHint.textContent = __('transaction.hint_asset');
            if (destHint) destHint.textContent = __('transaction.hint_asset');
        } else {
            if (sourceHint) sourceHint.textContent = __('transaction.hint_asset');
            if (destHint) destHint.textContent = __('transaction.hint_expense');
        }
    }

    /**
     * Maneja el cambio de tipo de transacción.
     */
    function onTransactionTypeChanged(newType, accountsCache) {
        const hiddenInput = document.getElementById('transaction-type');
        if (hiddenInput) hiddenInput.value = newType;

        // Actualizar hints
        updateTypeHints(newType);

        // Actualizar placeholder de cuenta default
        prefillDefaultSource(accountsCache, newType);

        // Cerrar dropdowns abiertos
        hideDropdown('#source-autocomplete');
        hideDropdown('#destination-autocomplete');
    }

    /**
     * Configura el selector visual de tipo de transacción (segmented control iOS).
     */
    function setupTransactionTypeSelector(accountsCache) {
        const selector = document.getElementById('type-selector');
        if (!selector) return;
        const buttons = selector.querySelectorAll('.segmented-btn');

        selector.addEventListener('click', function(e) {
            var btn = e.target.closest('.segmented-btn');
            if (!btn) return;
            const newType = btn.getAttribute('data-type');
            var typeEl = document.getElementById('transaction-type');
            const currentType = typeEl ? typeEl.value : 'withdrawal';

            if (newType === currentType) return;

            // Toggle active class para segmented control iOS-style
            buttons.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-checked', 'true');

            onTransactionTypeChanged(newType, accountsCache);
        });
    }

    /**
     * Inicializa el sistema de cuentas.
     */
    function setupAccountSystem(accountsCache) {
        if (!accountsCache || accountsCache.length === 0) {
            window.FFPWA.showStatusMessage(__('status.accounts_system_fail'), 'error');
            console.warn('SETUP FAILED: No hay cuentas disponibles. Autocompletado inactivo.');
            return;
        }

        var typeEl = document.getElementById('transaction-type');
        const currentType = (typeEl ? typeEl.value : '') || 'withdrawal';

        initAutocomplete(
            'source-account', 'source-autocomplete',
            'destination-account', 'destination-autocomplete',
            accountsCache
        );

        setupTransactionTypeSelector(accountsCache);
        updateTypeHints(currentType);
        prefillDefaultSource(accountsCache, currentType);

        // Exponer cache globalmente para otros módulos (transactions.js)
        window.FFPWA.accountsCache = accountsCache;

        window.FFPWA.showStatusMessage(__('status.accounts_system_ok', { count: accountsCache.length }), 'success');
    }

    /**
     * Punto de entrada: evento disparado por config.js
     */
    window.FFPWA._onLocaleAccounts = function() {
        var typeEl = document.getElementById('transaction-type');
        const currentType = (typeEl ? typeEl.value : '') || 'withdrawal';
        updateTypeHints(currentType);
        const cache = window.FFPWA.accountsCache;
        if (cache) prefillDefaultSource(cache, currentType);
    };

    window.FFPWA._initAccountsOnConfigLoaded = function() {
        console.log('================================================');
        console.log('✅ Iniciando Dashboard.');
        console.log('================================================');

        let accounts = getCachedAccounts();

        if (accounts) {
            console.log('[INIT]: ' + __('resource.currencies_cache'));
            setupAccountSystem(accounts);

            // ── Stale-while-revalidate: fetch solo si cargamos de caché ──
            fetchAccounts(window.FFPWA.config.url, window.FFPWA.config.token)
                .then(function(freshAccounts) {
                    cacheAccounts(freshAccounts);
                    var current = window.FFPWA.accountsCache;
                    if (!current || current.length !== freshAccounts.length) {
                        console.log('[DEBUG] Cache actualizado: ' + freshAccounts.length + ' cuentas (era ' + (current ? current.length : 0) + ')');
                        setupAccountSystem(freshAccounts);
                    } else {
                        console.log('[DEBUG] Cuentas sin cambios (' + freshAccounts.length + ')');
                    }
                })
                .catch(function(err) {
                    console.warn('[DEBUG] Fetch silencioso falló:', err.message);
                });
        } else {
            console.log('[INIT]: Sin caché, cargando desde backend...');
            fetchAccounts(window.FFPWA.config.url, window.FFPWA.config.token)
                .then(function(accounts) {
                    cacheAccounts(accounts);
                    setupAccountSystem(accounts);
                })
                .catch(function() {
                    setupAccountSystem(null);
                });
        }
    };

})();