const ACCOUNT_STORAGE_KEY = 'firefly_accounts_cache';

function hideDropdown(element) {
    $(element).addClass('hidden');
}

function updateStatus(statusText, className) {
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
                
                console.log(`✅ DEBUG [API]: Cuentas cargadas exitosamente: ${cleanAccounts.length}`);
                resolve(cleanAccounts);
            },
            error: function(xhr) {
                console.error('❌ DEBUG [API]: Error al cargar cuentas:', xhr.statusText);
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
        console.log('✅ DEBUG [CACHE]: Cuentas cacheadas exitosamente en localStorage.');
    } catch (e) {
        console.error('❌ DEBUG [CACHE]: Error al cachear cuentas en localStorage:', e);
    }
}

/**
 * Selecciona una cuenta existente y actualiza los campos del formulario
 * para un campo específico (origen o destino).
 * @param {Object} account - Objeto {id, name, type} de la cuenta existente.
 * @param {string} field - 'source' (origen) o 'destination' (destino).
 */
function selectExistingAccount(account, field) {
    // Lógica de actualización de inputs/hidden fields
    const updateFields = (field) => {
        if (field === 'source') {
            $('#source-account').val(account.name);
            $('#source-account-id').val(account.id);
            $('#source-account-name').val(account.name);
        } else { // field === 'destination'
            $('#destination-account').val(account.name);
            $('#destination-account-id').val(account.id);
            $('#destination-account-name').val(account.name);
        }
    };

    updateFields(field);
    
    // Ocultar dropdowns
    hideDropdown('#source-autocomplete');
    hideDropdown('#destination-autocomplete');
}


/**
 * Selecciona la opción para crear una cuenta nueva.
 * @param {Object} newAccount - Objeto {name} del nombre nuevo.
 * @param {string} field - 'source' o 'destination'.
 */
function selectNewAccount(newAccount, field) {
    const name = newAccount.name;
    
    // Función de actualización de inputs/hidden fields
    const updateFields = (field) => {
        if (field === 'source') {
            $('#source-account').val(name);
            $('#source-account-name').val(name);
            $('#source-account-id').val(''); // No enviamos ID
        } else { // field === 'destination'
            $('#destination-account').val(name);
            $('#destination-account-name').val(name);
            $('#destination-account-id').val(''); // No enviamos ID
        }
    };

    updateFields(field);

    showStatusMessage(`⚠️ Atención: Se ha seleccionado la opción de crear una nueva cuenta (${field}).`, 'bg-yellow-100 text-yellow-800');
    
    // Ocultar dropdowns
    hideDropdown('#source-autocomplete');
    hideDropdown('#destination-autocomplete');
}

/**
 * Filtra la lista de cuentas y muestra el dropdown de sugerencias.
 * @param {Event} e - El evento de keyup.
 * @param {HTMLElement} inputElement - El elemento de input que disparó el evento.
 * @param {HTMLElement} dropdownElement - El contenedor del dropdown (autocomplete).
 * @param {string} fieldContext - 'source' o 'destination'.
 * @param {Array<{id: number, name: string, type: string}>} cache - La lista de cuentas cacheada.
 */
function filterAndDisplayAccounts(e, inputElement, dropdownElement, fieldContext, cache) {
    const query = $(inputElement).val().trim().toLowerCase();
    
    if (query.length < 2) {
        hideDropdown(dropdownElement);
        return;
    }

    let filteredAccounts = [];
    let accountsToFilter = [];

    if (fieldContext === 'source') {
        accountsToFilter = cache.filter(account => account.type === 'asset');
    } else { 
        accountsToFilter = cache.filter(account => account.type === 'expense');
    }

    filteredAccounts = accountsToFilter.filter(account => 
        account.name.toLowerCase().includes(query)
    );

    let results = [];
    results = results.concat(filteredAccounts);

    const newAccountName = query;
    results.push({
        name: newAccountName,
        id: undefined, 
        isNew: true
    });
    
    renderAutocomplete(dropdownElement, results);
    
    $(dropdownElement).removeClass('hidden');
}

/**
 * Renderiza el dropdown de sugerencias usando atributos data-* para almacenar datos.
 * @param {jQuery} dropdownEl - El selector jQuery del contenedor UL.
 * @param {Array<Object>} results - Lista de objetos {name, id, isNew}.
 */
function renderAutocomplete(dropdownEl, results) {
    dropdownEl.empty();

    let htmlContent = '';
    
    results.forEach(item => {
        let visibleName = item.name;
        let dataAttributes = `data-account-id="${item.id !== undefined ? item.id : ''}" data-account-name="${item.name}"`;
        
        if (item.isNew) {
            visibleName = `${item.name}`;
            dataAttributes += ` data-is-new="true"`;
        } else {
            visibleName = `${item.name}`;
            dataAttributes += ` data-is-new="false"`;
        }

        let htmlSnippet = `<li ${dataAttributes} class="autocomplete-item p-2 cursor-pointer hover:bg-indigo-50"><span class="text-gray-800">${visibleName}</span></li>`;
        
        htmlContent += htmlSnippet;
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

        // Determinar el contexto del evento clic (source o destination)
        const context = $clickedItem.closest('.autocomplete-dropdown').attr('id') === 'source-autocomplete' ? 'source' : 'destination';

        if (isNew) {
            selectNewAccount({name: name, isNew: true}, context);
        } else {
            selectExistingAccount({id: parseInt(id), name: name}, context);
        }
    });
}

/**
 * Esta función debe ser llamada por el sistema de configuración (config.js) 
 * para iniciar el autocompletado.
 * @param {jQuery} sourceInputId - ID del input fuente.
 * @param {jQuery} sourceDropdownId - ID del dropdown fuente.
 * @param {jQuery} destInputId - ID del input destino.
 * @param {jQuery} destDropdownId - ID del dropdown destino.
 * @param {Array<{id: number, name: string, type: string}>} accountsCache - La lista de cuentas.
 */
function initAutocomplete(sourceInputId, sourceDropdownId, destInputId, destDropdownId, accountsCache) {
    const sourceInput = $(`#${sourceInputId}`);
    const sourceDropdown = $(`#${sourceDropdownId}`);
    const destInput = $(`#${destInputId}`);
    const destDropdown = $(`#${destDropdownId}`);

    // Listener para el campo fuente
    const sourceHandler = function() {
        filterAndDisplayAccounts(event, $(this), $(sourceDropdown), 'source', accountsCache);
    };
    sourceInput.on('keyup change', sourceHandler);
    
    // Listener para el campo destino
    const destHandler = function() {
        filterAndDisplayAccounts(event, $(this), $(destDropdown), 'destination', accountsCache);
    };
    destInput.on('keyup change', destHandler);

    // Configurar los manejadores de clics delegados
    setupDropdownClickHandler(sourceDropdown);
    setupDropdownClickHandler(destDropdown);

    // Manejar clics fuera de los dropdowns
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.autocomplete-dropdown').length) {
            hideDropdown(sourceDropdown);
            hideDropdown(destDropdown);
        }
    });
}

/**
 * Función principal de inicialización de cuentas (llamado por app.js).
 * @param {Array<{id: number, name: string, type: string}>} accountsCache - La lista de cuentas.
 */
function setupAccountSystem(accountsCache) {
    // 1. Validación de cuentas
    if (!accountsCache || accountsCache.length === 0) {
        showStatusMessage('🔴 ¡ALERTA! No se encontraron cuentas. El autocompletado está inactivo. Por favor, conéctate a internet para sincronizar.', 'bg-red-100 text-red-800');
        console.warn('SETUP FAILED: No hay cuentas disponibles. Autocompletado inactivo.');
        return; 
    }

    // 2. Inicializamos el sistema de autocompletado de inmediato
    initAutocomplete(
        'source-account', 'source-autocomplete', 
        'destination-account', 'destination-autocomplete', 
        accountsCache
    );

    showStatusMessage(`✅ Sistema de cuentas activo. Cuentas cargadas: ${accountsCache.length}. (Origen filtrado: Asset / Destino filtrado: Expense)`, 'bg-green-100 text-green-800');
}

/**
 * Este listener es el punto de entrada que orquesta todo el proceso de cuentas.
 */
$(window).on('configLoaded', function() {
    console.log('================================================');
    console.log('✅ Fase de Configuración Completada. Iniciando Dashboard.');
    console.log('================================================');
    
    // 1. Intentar obtener la lista de cuentas de la caché
    let accounts = getCachedAccounts();

    if (accounts) {
        console.log('DEBUG [INIT]: Usando cuentas de la caché local.');
        setupAccountSystem(accounts);
    } else {
        // 2. Si no hay caché, intentar la conexión
        fetchAccounts(window.FIREFLY_CONFIG.url, window.FIREFLY_CONFIG.token)
            .then(accounts => {
                cacheAccounts(accounts); 
                setupAccountSystem(accounts);
            })
            .catch(error => {
                // Manejo de error de conexión.
                setupAccountSystem(null);
            });
    }
});