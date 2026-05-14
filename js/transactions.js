(function() {
    'use strict';

    const QUEUE_STORAGE_KEY = 'firefly_transaction_queue';
    const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

    window.FFPWA = window.FFPWA || {};

    // Estado del servidor Firefly
    let fireflyServerAvailable = true;
    let healthCheckIntervalId = null;

    /**
     * Muestra un mensaje temporal en la interfaz.
     * @param {string} message - Texto del mensaje
     * @param {string} type - 'success' | 'warning' | 'error'
     */
    function showStatusMessage(message, type) {
        const $status = $('#status-message');
        $status.removeClass('hidden bg-green-100 text-green-800 bg-red-100 text-red-800 bg-yellow-100 text-yellow-800')
               .addClass('p-3 rounded-md mb-4 text-sm transition-all');

        if (type === 'success') {
            $status.addClass('bg-green-100 text-green-800');
        } else if (type === 'warning') {
            $status.addClass('bg-yellow-100 text-yellow-800');
        } else {
            $status.addClass('bg-red-100 text-red-800');
        }
        $status.text(message);

        // Auto-ocultar después de 6s (más tiempo para warnings/errores)
        const delay = type === 'success' ? 5000 : 8000;
        if (window.FFPWA._statusTimeout) clearTimeout(window.FFPWA._statusTimeout);
        window.FFPWA._statusTimeout = setTimeout(() => {
            $status.addClass('hidden');
        }, delay);
    }
    window.FFPWA.showStatusMessage = showStatusMessage;

    /**
     * Valida y parsea el monto del formulario.
     * @returns {string} Monto formateado a 2 decimales
     * @throws {Error} Si el monto no es válido
     */
    function validateAndFormatAmount() {
        const raw = $('#amount').val().trim();
        if (!raw) {
            throw new Error('Por favor, ingresa un monto.');
        }
        const amount = parseFloat(raw.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            throw new Error('El monto debe ser un número positivo. Ej: 100.50');
        }
        return amount.toFixed(2);
    }

    /**
     * Resuelve una cuenta (origen o destino):
     * - Si el usuario escribió algo en el campo visible, usa ese valor.
     * - Si el campo está vacío y aplica, usa la cuenta default registrada.
     * - Para depósitos: default va en destino.
     * - Para retiros/transferencias: default va en origen.
     */
    function resolveField(field) {
        const transactionType = $('#transaction-type').val() || 'withdrawal';
        const prefix = field === 'source' ? 'source' : 'destination';
        const visibleValue = $(`#${prefix}-account`).val().trim();
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;

        if (visibleValue) {
            return {
                id: $(`#${prefix}-account-id`).val() || null,
                name: $(`#${prefix}-account-name`).val() || visibleValue
            };
        }

        // Para depósitos: la cuenta default (asset) va en destino
        if (transactionType === 'deposit' && field === 'destination') {
            if (defaultAccount && defaultAccount.id) {
                return { id: String(defaultAccount.id), name: defaultAccount.name };
            }
        }

        // Para retiros y transferencias: la cuenta default va en origen
        if (transactionType !== 'deposit' && field === 'source') {
            if (defaultAccount && defaultAccount.id) {
                return { id: String(defaultAccount.id), name: defaultAccount.name };
            }
        }

        return { id: null, name: null };
    }

    /**
     * Busca la moneda de una cuenta en el caché global.
     */
    function getAccountCurrency(accountId) {
        const cache = window.FFPWA.accountsCache;
        if (!cache || !accountId) return null;
        const account = cache.find(a => String(a.id) === String(accountId));
        return account ? (account.currency_code || null) : null;
    }

    function getAccountDecimalPlaces(accountId) {
        const cache = window.FFPWA.accountsCache;
        if (!cache || !accountId) return null;
        const account = cache.find(a => String(a.id) === String(accountId));
        return account ? (account.currency_decimal_places || 2) : null;
    }

    /**
     * Recopila y transforma los datos del formulario en el formato JSON requerido por Firefly III.
     */
    async function buildTransactionPayload() {
        const transactionType = $('#transaction-type').val() || 'withdrawal';
        const source = resolveField('source');
        const dest = resolveField('destination');

        if (!source.name || !dest.name) {
            throw new Error('Por favor, selecciona o ingresa nombres de cuenta válidos para ambos campos.');
        }

        // Validaciones según tipo
        if (transactionType === 'deposit') {
            // En depósitos, destino es asset — no se puede crear cuenta nueva
            if (!dest.id) {
                throw new Error('La cuenta destino (Asset) debe existir. Selecciona una cuenta existente.');
            }
        } else if (transactionType === 'transfer') {
            // Transferencias: ambas cuentas son asset — no se pueden crear nuevas
            if (!source.id) {
                throw new Error('La cuenta origen (Asset) debe existir. Selecciona una cuenta existente.');
            }
            if (!dest.id) {
                throw new Error('La cuenta destino (Asset) debe existir. Selecciona una cuenta existente.');
            }
        }

        const amount = validateAndFormatAmount();
        const selectedCurrency = $('#currency-select').val();
        const primaryCurrency = window.FFPWA.currencies && window.FFPWA.currencies.primary;

        // Construir la transacción dinámicamente:
        // - Si hay ID, enviarlo (cuenta existente seleccionada)
        // - Si no hay ID, NO incluirlo (Firefly creará la cuenta por el nombre)
        const transaction = {
            "type": transactionType,
            "description": $('#description').val().trim() || "Transacción sin descripción",
            "date": new Date().toISOString(),
            "source_name": source.name
        };

        // ── Transferencias: detección automática de monedas entre cuentas ──
        if (transactionType === 'transfer') {
            const sourceCurrency = getAccountCurrency(source.id);
            const destCurrency = getAccountCurrency(dest.id);

            if (sourceCurrency && destCurrency && sourceCurrency !== destCurrency) {
                // Monedas diferentes: amount en moneda origen, foreign en moneda destino
                console.log(`💱 Transfer: ${sourceCurrency} → ${destCurrency}`);
                try {
                    const rateInfo = await window.FFPWA.getExchangeRate(sourceCurrency, destCurrency);
                    const destPlaces = getAccountDecimalPlaces(dest.id) || 2;
                    const converted = (parseFloat(amount) * rateInfo.rate).toFixed(destPlaces);
                    transaction.amount = amount;
                    transaction.foreign_amount = converted;
                    transaction.foreign_currency_code = destCurrency;
                    console.log(`💱 Transfer: ${amount} ${sourceCurrency} → ${converted} ${destCurrency} (tasa: ${rateInfo.rate})`);
                } catch (e) {
                    throw new Error(
                        `Tipo de cambio ${sourceCurrency} → ${destCurrency} no disponible. ` +
                        'Intenta de nuevo en unos segundos.'
                    );
                }
            } else {
                // Misma moneda o no disponible — flujo normal
                transaction.amount = amount;
            }
        }
        // ── Withdrawal / Deposit: usar lógica del dropdown ──
        else if (primaryCurrency && selectedCurrency && selectedCurrency !== primaryCurrency.code) {
            const rateInfo = window.FFPWA.getCachedRate(selectedCurrency, primaryCurrency.code);
            if (!rateInfo) {
                throw new Error(
                    `Tipo de cambio ${selectedCurrency} → ${primaryCurrency.code} no disponible. ` +
                    'Espera a que se cargue o usa la moneda predeterminada.'
                );
            }
            const converted = (parseFloat(amount) * rateInfo.rate).toFixed(primaryCurrency.decimal_places || 2);
            transaction.amount = converted;
            transaction.foreign_amount = amount;
            transaction.foreign_currency_code = selectedCurrency;
            console.log(`💱 Conversión: ${amount} ${selectedCurrency} → ${converted} ${primaryCurrency.code} (tasa: ${rateInfo.rate})`);
        } else {
            // Moneda primaria o sin datos de monedas — flujo normal
            transaction.amount = amount;
        }

        // Solo incluir source_id si existe (cuenta existente)
        if (source.id && source.id !== "") {
            transaction.source_id = source.id;
        }

        // Solo incluir destination_id si existe (cuenta existente)
        if (dest.id && dest.id !== "") {
            transaction.destination_id = dest.id;
        }

        // destination_name siempre se incluye
        transaction.destination_name = dest.name;

        return {
            "error_if_duplicate_hash": true,
            "apply_rules": true,
            "transactions": [transaction]
        };
    }

    /**
     * Limpia el formulario y restaura el placeholder con la cuenta default.
     */
    function resetTransactionForm() {
        const transactionType = $('#transaction-type').val() || 'withdrawal';
        $('#transaction-form')[0].reset();
        $('#source-account-id').val('');
        $('#source-account-name').val('');
        $('#destination-account-id').val('');
        $('#destination-account-name').val('');

        // Restaurar placeholder default según tipo
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;
        if (defaultAccount && defaultAccount.id) {
            const isDeposit = transactionType === 'deposit';
            const targetField = isDeposit ? 'destination' : 'source';
            $(`#${targetField}-account`).val('').attr('placeholder', defaultAccount.name + ' (default)');
            $(`#${targetField}-account-id`).val(defaultAccount.id);
            $(`#${targetField}-account-name`).val(defaultAccount.name);
        }
    }

    /**
     * Envía la transacción al API.
     * Rechaza con un objeto { message, status } para que el caller
     * pueda distinguir entre errores de auth y errores temporales.
     */
    function sendTransaction(payload) {
        const token = window.FFPWA.config.token;
        const url = window.FFPWA.config.url;

        console.log('--- Intentando enviar transacción ---', payload);

        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${url}/api/v1/transactions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(payload),
                dataType: 'json',
                success: function(response) {
                    console.log("✅ Transacción enviada exitosamente.");
                    resolve(true);
                },
                error: function(xhr) {
                    let errorMsg = `Error al registrar transacción: ${xhr.statusText}.`;
                    if (xhr.responseJSON && xhr.responseJSON.message) {
                        errorMsg += ` Detalles: ${xhr.responseJSON.message}`;
                    }
                    const status = xhr.status || 0;
                    console.error("❌ Error de envío:", errorMsg, `(HTTP ${status})`);
                    reject({ message: errorMsg, status: status });
                }
            });
        });
    }

    /**
     * Agrega una transacción a la cola de sincronización offline.
     */
    function queueTransaction(payload) {
        let queue = getQueue();
        queue.push(payload);
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        console.log(`🟡 Transacción encolada. Cola actual: ${queue.length} ítems.`);

        showStatusMessage('💾 Transacción guardada localmente. Se sincronizará cuando haya conexión.', 'warning');

        // Registrar Background Sync si el navegador lo soporta
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                registration.sync.register('sync-transactions')
                    .then(() => console.log('✅ Sync registrado: sync-transactions'))
                    .catch(err => console.warn('⚠️ Fallo al registrar sync:', err));
            });
        }
    }

    /**
     * Obtiene la cola de transacciones pendientes.
     */
    function getQueue() {
        const storedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
        return storedQueue ? JSON.parse(storedQueue) : [];
    }

    /**
     * Procesa la cola de sincronización.
     * No se rompe en el primer error: las falladas se quedan para reintento.
     */
    async function syncQueue() {
        const queue = getQueue();
        if (queue.length === 0) {
            console.log('📦 Cola de sincronización vacía.');
            return;
        }

        if (!navigator.onLine) {
            console.warn('❌ Intento de sincronización fallido: No hay conexión.');
            return;
        }

        showStatusMessage(`🔄 Sincronizando ${queue.length} transacciones...`, 'warning');

        const remaining = [];
        let successfulSends = 0;
        let failedSends = 0;

        for (let i = 0; i < queue.length; i++) {
            try {
                await sendTransaction(queue[i]);
                successfulSends++;
            } catch (e) {
                console.error(`❌ Falló tx #${i + 1}:`, e.message);
                remaining.push(queue[i]);
                failedSends++;
            }
        }

        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remaining));

        let message = '';
        if (successfulSends > 0) {
            message += `✔️ ${successfulSends} transacción(es) enviada(s). `;
        }
        if (failedSends > 0) {
            message += `⚠️ ${failedSends} fallaron y serán reintentadas.`;
            showStatusMessage(message, 'warning');
        } else {
            message = message || '🔄 Sincronización completada.';
            showStatusMessage(message, 'success');
        }

        // Si la cola quedó vacía, detener health check
        if (remaining.length === 0 && healthCheckIntervalId) {
            stopFireflyHealthCheck();
        }
    }
    window.FFPWA.syncQueue = syncQueue;

    /**
     * Health check al servidor Firefly via /api/v1/about.
     * Si responde exitosamente y el servidor estaba marcado como no disponible,
     * actualiza el estado e intenta sincronizar la cola.
     * @returns {Promise<boolean>} true si el servidor responde, false si no
     */
    function checkFireflyHealth() {
        const url = window.FFPWA.config.url;
        const token = window.FFPWA.config.token;
        if (!url) return Promise.resolve(false);

        console.log('[HEALTH] Verificando disponibilidad del servidor Firefly...');

        return new Promise((resolve) => {
            $.ajax({
                url: `${url}/api/v1/about`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 10000,
                success: function() {
                    if (!fireflyServerAvailable) {
                        console.log('[HEALTH] ✅ Servidor Firefly disponible de nuevo.');
                        window.FFPWA.updateStatus('🟢 Online');
                        fireflyServerAvailable = true;
                        syncQueue();
                    }
                    // Si la cola está vacía, no necesitamos seguir monitoreando
                    if (getQueue().length === 0 && healthCheckIntervalId) {
                        stopFireflyHealthCheck();
                    }
                    resolve(true);
                },
                error: function(xhr) {
                    if (fireflyServerAvailable) {
                        console.warn('[HEALTH] ❌ Servidor Firefly no disponible.');
                        window.FFPWA.updateStatus('🔶 Servidor no disponible');
                        fireflyServerAvailable = false;
                    }
                    resolve(false);
                }
            });
        });
    }
    window.FFPWA.checkFireflyHealth = checkFireflyHealth;

    /**
     * Inicia el health check periódico (cada 5 minutos).
     * No crea intervalos duplicados si ya está corriendo.
     */
    function startFireflyHealthCheck() {
        if (healthCheckIntervalId) {
            console.log('[HEALTH] Health check ya estaba corriendo.');
            return;
        }
        console.log('[HEALTH] Iniciando health check cada 5 minutos.');
        // Hacer una verificación inmediata primero
        checkFireflyHealth();
        healthCheckIntervalId = setInterval(checkFireflyHealth, HEALTH_CHECK_INTERVAL);
    }
    window.FFPWA.startFireflyHealthCheck = startFireflyHealthCheck;

    /**
     * Detiene el health check periódico.
     */
    function stopFireflyHealthCheck() {
        if (healthCheckIntervalId) {
            clearInterval(healthCheckIntervalId);
            healthCheckIntervalId = null;
            console.log('[HEALTH] Health check detenido.');
        }
    }
    window.FFPWA.stopFireflyHealthCheck = stopFireflyHealthCheck;

    /**
     * Maneja el envío del formulario de transacción.
     * - Online + servidor responde → envía directo ✅
     * - Online + servidor caído → encola + inicia health check 🟡
     * - Offline → encola 💾
     * - Auth errors (401/403) → muestra error, no encola 🔴
     */
    async function handleTransactionSubmit(e) {
        e.preventDefault();

        let transactionPayload = null;
        try {
            transactionPayload = await buildTransactionPayload();
        } catch (error) {
            showStatusMessage(`❌ ${error.message}`, 'error');
            return;
        }

        const $btn = $('#submit-transaction-btn');
        $btn.prop('disabled', true).text('Enviando...');

        if (navigator.onLine) {
            sendTransaction(transactionPayload)
                .then(() => {
                    showStatusMessage('✅ Transacción registrada exitosamente.', 'success');
                    resetTransactionForm();
                    // Si el servidor estaba marcado como caído, restaurar estado
                    if (!fireflyServerAvailable) {
                        fireflyServerAvailable = true;
                        window.FFPWA.updateStatus('🟢 Online');
                        stopFireflyHealthCheck();
                    }
                })
                .catch(error => {
                    const status = error.status || 0;

                    // Errores de autenticación o autorización: no son recuperables
                    if (status === 401 || status === 403) {
                        showStatusMessage(`🛑 ${error.message}`, 'error');
                        window.FFPWA.updateStatus('🔶 Servidor no disponible');
                        fireflyServerAvailable = false;
                        startFireflyHealthCheck();
                    }
                    // Errores temporales: servidor caído, timeout, 5xx
                    else {
                        showStatusMessage('🟡 Servidor Firefly no disponible. Transacción encolada para reintento.', 'warning');
                        queueTransaction(transactionPayload);
                        resetTransactionForm();
                        window.FFPWA.updateStatus('🔶 Servidor no disponible');
                        fireflyServerAvailable = false;
                        startFireflyHealthCheck();
                    }
                })
                .finally(() => {
                    $btn.prop('disabled', false).text('Registrar Transacción');
                });
        } else {
            queueTransaction(transactionPayload);
            resetTransactionForm();
            $btn.prop('disabled', false).text('Registrar Transacción');
        }
    }

    $(document).ready(function() {
        $('#transaction-form').on('submit', handleTransactionSubmit);

        // Al recuperar conexión de red, verificar salud del servidor antes de sincronizar
        window.addEventListener('online', () => {
            console.log('[NETWORK]: Online. Verificando servidor...');
            if (fireflyServerAvailable) {
                window.FFPWA.updateStatus('🟢 Online');
                syncQueue();
            } else {
                window.FFPWA.updateStatus('🔶 Servidor no disponible (verificando...)');
                checkFireflyHealth();
            }
        });

        window.addEventListener('offline', () => {
            window.FFPWA.updateStatus('🔴 Offline');
            console.log('[NETWORK]: Offline. Modo desconectado.');
        });

        // Escuchar mensajes del Service Worker (Background Sync)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'BACKGROUND_SYNC') {
                    console.log(`[CLIENT] Recibido BACKGROUND_SYNC del SW (tag: ${event.data.tag}). Ejecutando syncQueue...`);
                    // Primero verificar que el servidor esté disponible
                    if (fireflyServerAvailable) {
                        syncQueue();
                    } else {
                        checkFireflyHealth();
                    }
                }
            });
        }

        // Iniciar health check para monitorear disponibilidad del servidor
        const pendingQueue = getQueue();
        if (pendingQueue.length > 0) {
            console.log(`[INIT] ${pendingQueue.length} transacción(es) pendiente(s) en la cola.`);
            fireflyServerAvailable = false;
            window.FFPWA.updateStatus('🔶 Servidor no disponible');
        }
        // Siempre iniciar health check para monitoreo continuo;
        // si no hay items pendientes, se detendrá automáticamente
        // al detectar que el servidor responde y la cola está vacía.
        startFireflyHealthCheck();
    });

})();
