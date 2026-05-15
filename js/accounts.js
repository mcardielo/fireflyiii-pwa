(function() {
    'use strict';

    const ACCOUNT_STORAGE_KEY = 'firefly_accounts_cache';

    window.FFPWA = window.FFPWA || {};

    function hideDropdown(element) {
        $(element).removeClass('visible').addClass('hidden');
    }

    /**
     * Muestra el dropdown de autocomplete con posición fixed.
     */
    function showDropdown(element) {
        const $dropdown = $(element);
        const $input = $dropdown.closest('.relative').find('input');
        const rect = $input[0].getBoundingClientRect();

        $dropdown.css({
            top: (rect.bottom + 4) + 'px',
            left: rect.left + 'px',
            width: rect.width + 'px'
        });

        $dropdown.removeClass('hidden').addClass('visible');
    }

    /**
     * Devuelve el tipo de cuenta filtrado para un campo según el tipo de transacción.
     */
    function getAccountTypeForField(transactionType, fieldContext) {
        if (transactionType === 'deposit') {
            return fieldContext === 'source' ? 'revenue' : 'asset';
        }
        if (transactionType === 'transfer') {
            return 'asset'; // ambos campos
        }
        // withdrawal (default)
        return fieldContext === 'source' ? 'asset' : 'expense';
    }
    window.FFPWA.getAccountTypeForField = getAccountTypeForField;

    function updateStatus(statusText) {
        const statusEl = $('#online-status');
        statusEl.removeClass('bg-green-100 text-green-800 bg-red-100 text-red-800 bg-yellow-100 text-yellow-800');
        if (statusText.includes('Online')) {
            statusEl.addClass('bg-green-100 text-green-800');
        } else if (statusText.includes('Offline')) {
            statusEl.addClass('bg-red-100 text-red-800');
        } else {
            statusEl.addClass('bg-yellow-100 text-yellow-800');
        }
        statusEl.text(statusText);
    }
    window.FFPWA.updateStatus = updateStatus;

    function getCachedAccounts() {
        const cachedData = localStorage.getItem(ACCOUNT_STORAGE_KEY);
        return cachedData ? JSON.parse(cachedData) : null;
    }

    function fetchAccounts(url, token) {
        return new Promise((resolve, reject) => {
            $.ajax({
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
                        currency_decimal_places: account.attributes.currency_decimal_places || 2
                    }));

                    console.log(`✅ [API]: Cuentas cargadas exitosamente: ${cleanAccounts.length}`);
                    resolve(cleanAccounts);
                },
                error: function(xhr) {
                    console.error('❌ [API]: Error al cargar cuentas:', xhr.statusText);
                    let message = '';
                    if (xhr.status === 401) {
                        message = 'Error de token. Por favor, verifica tus credenciales.';
                    } else if (xhr.status !== 0) {
                        message = `Error de conexión al cargar cuentas: ${xhr.statusText}.`;
                    } else {
                        message = 'Error de conexión. Por favor, revisa la URL o tu conexión a internet.';
                    }
                    reject(new Error(message));
                }
            });
        });
    }

    function cacheAccounts(accounts) {
        try {
            localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
            console.log('✅ [CACHE]: Cuentas cacheadas exitosamente en localStorage.');
        } catch (e) {
            console.error('❌ [CACHE]: Error al cachear cuentas en localStorage:', e);
        }
    }

    /**
     * Selecciona una cuenta existente y actualiza los campos del formulario.
     */
    function selectExistingAccount(account, field) {
        // Validar que el ID sea numérico válido
         const id = (account.id !== undefined && account.id !== null && !isNaN(account.id))
             ? account.id : '';
             
        if (field === 'source') {
            $('#source-account').val(account.name);
            $('#source-account-id').val(id);
            $('#source-account-name').val(account.name);
        } else {
            $('#destination-account').val(account.name);
            $('#destination-account-id').val(id);
            $('#destination-account-name').val(account.name);
        }

        hideDropdown('#source-autocomplete');
        hideDropdown('#destination-autocomplete');
    }

    /**
     * Selecciona la opción para crear una cuenta nueva.
     */
    function selectNewAccount(newAccount, field) {
        const name = newAccount.name;

        if (field === 'source') {
            $('#source-account').val(name);
            $('#source-account-name').val(name);
            $('#source-account-id').val('');
        } else {
            $('#destination-account').val(name);
            $('#destination-account-name').val(name);
            $('#destination-account-id').val('');
        }

        window.FFPWA.showStatusMessage(`⚠️ Atención: Se ha seleccionado la opción de crear una nueva cuenta (${field}).`, 'warning');

        hideDropdown('#source-autocomplete');
        hideDropdown('#destination-autocomplete');
    }

    /**
     * Filtra la lista de cuentas y muestra el dropdown de sugerencias.
     */
    function filterAndDisplayAccounts(e, inputElement, dropdownElement, fieldContext, cache) {
        const rawValue = $(inputElement).val().trim();
        const query = rawValue.toLowerCase();

        if (query.length < 2) {
            hideDropdown(dropdownElement);
            return;
        }

        const transactionType = $('#transaction-type').val();
        const targetType = getAccountTypeForField(transactionType, fieldContext);

        let accountsToFilter = cache.filter(account =>
            account.type === targetType && account.active !== false
        );

        const filteredAccounts = accountsToFilter.filter(account =>
            account.name.toLowerCase().includes(query)
        );

        // Crear nueva cuenta: solo permitido si NO es tipo asset
        const results = filteredAccounts.slice();
        if (targetType !== 'asset') {
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
        dropdownEl.empty();

        let htmlContent = '';

        results.forEach(item => {
            const isNew = item.isNew || false;
            const dataAttributes = `data-account-id="${item.id !== undefined ? item.id : ''}" data-account-name="${item.name}" data-is-new="${isNew}"`;

            htmlContent += `<li ${dataAttributes} class="autocomplete-item">
                <span>${item.name}</span>
                ${isNew ? '<span class="new-badge">+ Crear nueva</span>' : ''}
            </li>`;
        });

        dropdownEl.append(htmlContent);
    }

    /**
     * Configura el manejador de selección con mousedown (se dispara
     * antes del blur/change del input, evitando el doble clic).
     */
    function setupDropdownClickHandler(dropdownEl) {
        $(dropdownEl).off('mousedown').on('mousedown', '.autocomplete-item', function(e) {
            e.preventDefault(); // Evita que el input pierda foco antes de seleccionar

            const $clickedItem = $(this);

            const id = $clickedItem.data('account-id');
            const name = $clickedItem.data('account-name');
            const isNew = $clickedItem.data('is-new') === true;

            const context = $clickedItem.closest('.autocomplete-dropdown').attr('id') === 'source-autocomplete' ? 'source' : 'destination';

            if (isNew) {
                selectNewAccount({ name: name, isNew: true }, context);
            } else {
                selectExistingAccount({ id: parseInt(id), name: name }, context);
            }
        });
    }

    /**
     * Inicializa el autocompletado para origen y destino.
     */
    function initAutocomplete(sourceInputId, sourceDropdownId, destInputId, destDropdownId, accountsCache) {
        const sourceInput = $(`#${sourceInputId}`);
        const sourceDropdown = $(`#${sourceDropdownId}`);
        const destInput = $(`#${destInputId}`);
        const destDropdown = $(`#${destDropdownId}`);

        // Listener para el campo fuente
        sourceInput.on('keyup change', function(e) {
            filterAndDisplayAccounts(e, this, sourceDropdown, 'source', accountsCache);
        });

        // Listener para el campo destino
        destInput.on('keyup change', function(e) {
            filterAndDisplayAccounts(e, this, destDropdown, 'destination', accountsCache);
        });

        // Configurar los manejadores de clics delegados
        setupDropdownClickHandler(sourceDropdown);
        setupDropdownClickHandler(destDropdown);

        // Clic fuera del dropdown o al seleccionar un item, lo cierra
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.autocomplete-dropdown').length &&
                !$(e.target).closest('#source-account, #destination-account').length) {
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

        const isDeposit = transactionType === 'deposit';
        const targetField = isDeposit ? 'destination' : 'source';
        const otherField = isDeposit ? 'source' : 'destination';

        // Limpiar el otro campo
        $(`#${otherField}-account`).val('').attr('placeholder', `Selecciona o escribe la cuenta ${otherField}...`);
        $(`#${otherField}-account-id`).val('');
        $(`#${otherField}-account-name`).val('');

        // Poner default en targetField
        $(`#${targetField}-account`).val('').attr('placeholder', match.name + ' (default)');
        $(`#${targetField}-account-id`).val(match.id);
        $(`#${targetField}-account-name`).val(match.name);

        console.log(`[DEFAULT] ${targetField} placeholder: ${match.name}`);
    }

    /**
     * Actualiza las etiquetas de tipo de cuenta según la transacción seleccionada.
     */
    function updateTypeHints(transactionType) {
        const sourceHint = $('#source-type-hint');
        const destHint = $('#dest-type-hint');

        if (transactionType === 'deposit') {
            sourceHint.text('(Revenue)');
            destHint.text('(Asset)');
        } else if (transactionType === 'transfer') {
            sourceHint.text('(Asset)');
            destHint.text('(Asset)');
        } else {
            sourceHint.text('(Asset)');
            destHint.text('(Expense)');
        }
    }

    /**
     * Maneja el cambio de tipo de transacción.
     */
    function onTransactionTypeChanged(newType, accountsCache) {
        const hiddenInput = $('#transaction-type');
        hiddenInput.val(newType);

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
        const $selector = $('#type-selector');
        const $buttons = $selector.find('.segmented-btn');

        $selector.on('click', '.segmented-btn', function() {
            const $btn = $(this);
            const newType = $btn.data('type');
            const currentType = $('#transaction-type').val();

            if (newType === currentType) return;

            // Toggle active class para segmented control iOS-style
            $buttons.removeClass('active');
            $btn.addClass('active');

            $buttons.attr('aria-checked', 'false');
            $btn.attr('aria-checked', 'true');

            onTransactionTypeChanged(newType, accountsCache);
        });
    }

    /**
     * Inicializa el sistema de cuentas.
     */
    function setupAccountSystem(accountsCache) {
        if (!accountsCache || accountsCache.length === 0) {
            window.FFPWA.showStatusMessage('🔴 No se encontraron cuentas. El autocompletado está inactivo. Conéctate a internet para sincronizar.', 'error');
            console.warn('SETUP FAILED: No hay cuentas disponibles. Autocompletado inactivo.');
            return;
        }

        const currentType = $('#transaction-type').val() || 'withdrawal';

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

        window.FFPWA.showStatusMessage(`✅ Sistema de cuentas activo. Cuentas cargadas: ${accountsCache.length}.`, 'success');
    }

    /**
     * Punto de entrada: evento disparado por config.js
     */
    $(window).on('configLoaded', function() {
        console.log('================================================');
        console.log('✅ Iniciando Dashboard.');
        console.log('================================================');

        let accounts = getCachedAccounts();

        if (accounts) {
            console.log('[INIT]: Usando cuentas de la caché local.');
            setupAccountSystem(accounts);
        } else {
            fetchAccounts(window.FFPWA.config.url, window.FFPWA.config.token)
                .then(accounts => {
                    cacheAccounts(accounts);
                    setupAccountSystem(accounts);
                })
                .catch(() => {
                    setupAccountSystem(null);
                });
        }
    });

})();
