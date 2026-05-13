(function() {
    'use strict';

    const ACCOUNT_STORAGE_KEY = 'firefly_accounts_cache';

    window.FFPWA = window.FFPWA || {};

    function hideDropdown(element) {
        $(element).addClass('hidden');
    }

    function updateStatus(statusText) {
        const statusEl = $('#online-status');
        statusEl.removeClass('bg-green-100 text-green-800 bg-red-100 text-red-800 bg-yellow-100 text-yellow-800');
        if (statusText === 'Online') {
            statusEl.addClass('bg-green-100 text-green-800');
        } else if (statusText === 'Offline') {
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
                        type: account.attributes.type
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
        if (field === 'source') {
            $('#source-account').val(account.name);
            $('#source-account-id').val(account.id);
            $('#source-account-name').val(account.name);
        } else {
            $('#destination-account').val(account.name);
            $('#destination-account-id').val(account.id);
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
        const query = $(inputElement).val().trim().toLowerCase();

        if (query.length < 2) {
            hideDropdown(dropdownElement);
            return;
        }

        let accountsToFilter = [];

        if (fieldContext === 'source') {
            accountsToFilter = cache.filter(account => account.type === 'asset');
        } else {
            accountsToFilter = cache.filter(account => account.type === 'expense');
        }

        const filteredAccounts = accountsToFilter.filter(account =>
            account.name.toLowerCase().includes(query)
        );

        const results = filteredAccounts.concat([{
            name: query,
            id: undefined,
            isNew: true
        }]);

        renderAutocomplete(dropdownElement, results);
        $(dropdownElement).removeClass('hidden');
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

            htmlContent += `<li ${dataAttributes} class="autocomplete-item p-2 cursor-pointer hover:bg-indigo-50">
                <span class="text-gray-800">${item.name}</span>
                ${isNew ? '<span class="text-xs text-indigo-500 ml-2">+ Crear nueva</span>' : ''}
            </li>`;
        });

        dropdownEl.append(htmlContent);
    }

    /**
     * Configura el manejador de clics usando Event Delegation.
     */
    function setupDropdownClickHandler(dropdownEl) {
        $(dropdownEl).off('click').on('click', '.autocomplete-item', function() {
            const $clickedItem = $(this);

            const id = $clickedItem.data('account-id');
            const name = $clickedItem.data('account-name');
            const isNew = $clickedItem.data('is-new') === 'true';

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

        // Clic fuera del dropdown lo cierra
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.autocomplete-dropdown').length) {
                hideDropdown(sourceDropdown);
                hideDropdown(destDropdown);
            }
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

        initAutocomplete(
            'source-account', 'source-autocomplete',
            'destination-account', 'destination-autocomplete',
            accountsCache
        );

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
