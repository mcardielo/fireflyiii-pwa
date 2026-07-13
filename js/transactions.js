(function() {
    'use strict';

    const QUEUE_STORAGE_KEY = 'firefly_transaction_queue';
    const MAX_QUEUE_SIZE = 100;
    const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
    const HEALTH_CHECK_INTERVAL_ACTIVE = 60 * 1000; // 1 minuto (cola con items pendientes)

    window.FFPWA = window.FFPWA || {};

    // Estado del servidor Firefly
    let fireflyServerAvailable = true;
    let healthCheckIntervalId = null;

    // Lock para evitar syncs simultáneas (race condition → duplicación)
    let isSyncing = false;

    /**
     * Muestra un toast temporal estilo, fixed overlay, sin afectar el layout.
     * @param {string} message - Texto del mensaje
     * @param {string} type - 'success' | 'warning' | 'error'
     */
    function showStatusMessage(message, type) {
        const status = document.getElementById('status-message');

        // Cancelar timeout y animación previos
        if (window.FFPWA._statusTimeout) clearTimeout(window.FFPWA._statusTimeout);

        if (!status) return;

        // Reset: quitar hidden y done-class, forzar repaint para que la transición se dispare
        status.classList.remove('hidden', 'ios-status-done', 'success', 'warning', 'error');
        void status.offsetHeight;

        if (type === 'success') {
            status.classList.add('success');
        } else if (type === 'warning') {
            status.classList.add('warning');
        } else {
            status.classList.add('error');
        }
        status.textContent = message;

        // Auto-ocultar: primero animar hacia arriba, luego display:none
        const delay = type === 'success' ? 5000 : 8000;
        window.FFPWA._statusTimeout = setTimeout(function() {
            status.classList.add('hidden'); // dispara la animación de salida
            setTimeout(function() {
                status.classList.add('ios-status-done');
            }, 360);
        }, delay);
    }
    window.FFPWA.showStatusMessage = showStatusMessage;

    /**
     * Valida y parsea el monto del formulario.
     * @returns {string} Monto formateado a 2 decimales
     * @throws {Error} Si el monto no es válido
     */
    function validateAndFormatAmount() {
        const amountEl = document.getElementById('amount');
        const raw = amountEl ? amountEl.value.trim() : '';
        if (!raw) {
            throw new Error(__('transaction.error.amount_required'));
        }
        const amount = parseFloat(raw.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            throw new Error(__('transaction.error.amount_positive'));
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
        var typeEl = document.getElementById('transaction-type');
        const transactionType = (typeEl ? typeEl.value : '') || 'withdrawal';
        const prefix = field === 'source' ? 'source' : 'destination';
        const visibleEl = document.getElementById(`${prefix}-account`);
        const visibleValue = visibleEl ? visibleEl.value.trim() : '';
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;

        if (visibleValue) {
            var idEl = document.getElementById(`${prefix}-account-id`);
            var nameEl = document.getElementById(`${prefix}-account-name`);
            return {
                id: (idEl ? idEl.value : '') || null,
                name: (nameEl ? nameEl.value : '') || visibleValue
            };
        }

        // La cuenta default va en el campo que dicta según tipo de transacción
        const { target } = window.FFPWA.getDefaultField(transactionType);
        if (field === target && defaultAccount && defaultAccount.id) {
            return { id: String(defaultAccount.id), name: defaultAccount.name };
        }

        return { id: null, name: null };
    }

    /**
     * Busca una cuenta por ID en el caché global.
     */
    function getAccountById(accountId) {
        const cache = window.FFPWA.accountsCache;
        if (!cache || !accountId) return null;
        return cache.find(a => String(a.id) === String(accountId)) || null;
    }

    /**
     * Busca la moneda de una cuenta en el caché global.
     */
    function getAccountCurrency(accountId) {
        const account = getAccountById(accountId);
        return account ? (account.currency_code || null) : null;
    }

    function getAccountDecimalPlaces(accountId) {
        const account = getAccountById(accountId);
        return account ? (account.currency_decimal_places || 2) : null;
    }

    /**
     * Recopila y transforma los datos del formulario en el formato JSON requerido por Firefly III.
     */
    async function buildTransactionPayload() {
        var typeEl = document.getElementById('transaction-type');
        const transactionType = (typeEl ? typeEl.value : '') || 'withdrawal';
        const source = resolveField('source');
        const dest = resolveField('destination');

        if (!source.name || !dest.name) {
            throw new Error(__('transaction.error.accounts_required'));
        }

        // Validaciones según tipo
        if (transactionType === 'deposit') {
            // En depósitos, destino es asset — no se puede crear cuenta nueva
            if (!dest.id) {
                throw new Error(__('transaction.error.dest_asset_required'));
            }
        } else if (transactionType === 'transfer') {
            // Transferencias: ambas cuentas son asset — no se pueden crear nuevas
            if (!source.id) {
                throw new Error(__('transaction.error.source_asset_required'));
            }
            if (!dest.id) {
                throw new Error(__('transaction.error.dest_asset_transfer'));
            }
        }

        // withdrawal/deposit no pueden tener liabilities en ambos lados
        if (transactionType === 'withdrawal' || transactionType === 'deposit') {
            let sourceIsLiability = false;
            let destIsLiability = false;

            if (source.id) {
                const srcAccount = getAccountById(source.id);
                sourceIsLiability = srcAccount && srcAccount.type === 'liabilities';
            }

            if (dest.id) {
                const dstAccount = getAccountById(dest.id);
                destIsLiability = dstAccount && dstAccount.type === 'liabilities';
            }

            if (sourceIsLiability && destIsLiability) {
                throw new Error(__('transaction.error.both_liabilities'));
            }
        }

        const amount = validateAndFormatAmount();

        var descEl = document.getElementById('description');
        // Construir la transacción dinámicamente:
        // - Si hay ID, enviarlo (cuenta existente seleccionada)
        // - Si no hay ID, NO incluirlo (Firefly creará la cuenta por el nombre)
        const transaction = {
            "type": transactionType,
            "description": (descEl ? descEl.value.trim() : '') || __('transaction.no_description'),
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
                    throw new Error(__('transaction.error.rate_unavailable', {
                        from: sourceCurrency,
                        to: destCurrency
                    }));
                }
            } else {
                // Misma moneda o no disponible — flujo normal
                transaction.amount = amount;
            }
        }
        // ── Withdrawal / Deposit: moneda la dicta la cuenta ──
        else {
            // Cuenta dictante: source para withdrawal, destination para deposit
            const dictatingId = transactionType === 'deposit' ? dest.id : source.id;
            const accountCurrency = dictatingId ? getAccountCurrency(dictatingId) : null;
            var curSelect = document.getElementById('currency-select');
            const selectedCurrency = curSelect ? curSelect.value : '';

            if (accountCurrency && selectedCurrency && selectedCurrency !== accountCurrency) {
                // El usuario pagó en moneda distinta a la de la cuenta → convertir
                console.log(`💱 ${transactionType}: ${selectedCurrency} → ${accountCurrency} (cuenta)`);
                try {
                    const rateInfo = await window.FFPWA.getExchangeRate(selectedCurrency, accountCurrency);
                    const decimalPlaces = getAccountDecimalPlaces(dictatingId) || 2;
                    const converted = (parseFloat(amount) * rateInfo.rate).toFixed(decimalPlaces);
                    transaction.amount = converted;
                    transaction.currency_code = accountCurrency;
                    transaction.foreign_amount = amount;
                    transaction.foreign_currency_code = selectedCurrency;
                    console.log(`💱 Conversión: ${amount} ${selectedCurrency} → ${converted} ${accountCurrency} (tasa: ${rateInfo.rate})`);
                } catch (e) {
                    throw new Error(__('transaction.error.rate_unavailable', {
                        from: selectedCurrency,
                        to: accountCurrency
                    }));
                }
            } else {
                transaction.amount = amount;
                if (accountCurrency) {
                    transaction.currency_code = accountCurrency;
                }
            }
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

        // ── GPS location ──
        var txGpsToggle = document.getElementById('tx-gps-toggle');
        var txGpsEnabled = window.FFPWA.config.gpsEnabled && txGpsToggle && txGpsToggle.checked;
        if (txGpsEnabled && window.FFPWA.lastLocation) {
            transaction.latitude = window.FFPWA.lastLocation.latitude;
            transaction.longitude = window.FFPWA.lastLocation.longitude;
            transaction.zoom_level = window.FFPWA.lastLocation.zoom_level;
        }

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
        var typeEl = document.getElementById('transaction-type');
        const transactionType = (typeEl ? typeEl.value : '') || 'withdrawal';
        var form = document.getElementById('transaction-form');
        if (form) form.reset();

        var srcId = document.getElementById('source-account-id');
        var srcName = document.getElementById('source-account-name');
        var destId = document.getElementById('destination-account-id');
        var destName = document.getElementById('destination-account-name');
        if (srcId) srcId.value = '';
        if (srcName) srcName.value = '';
        if (destId) destId.value = '';
        if (destName) destName.value = '';

        // Restaurar placeholder default según tipo
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;
        if (defaultAccount && defaultAccount.id) {
            const { target } = window.FFPWA.getDefaultField(transactionType);
            var targetAcc = document.getElementById(`${target}-account`);
            var targetAccId = document.getElementById(`${target}-account-id`);
            var targetAccName = document.getElementById(`${target}-account-name`);
            if (targetAcc) { targetAcc.value = ''; targetAcc.setAttribute('placeholder', __('accounts.placeholder_default', { name: defaultAccount.name })); }
            if (targetAccId) targetAccId.value = defaultAccount.id;
            if (targetAccName) targetAccName.value = defaultAccount.name;
        }

        // ── GPS toggle: update visibility ──
        updateGPSToggleVisibility();
    }

    /**
     * Muestra u oculta el toggle GPS según config.gpsEnabled.
     */
    function updateGPSToggleVisibility() {
        var row = document.getElementById('tx-gps-row');
        if (!row) return;
        if (window.FFPWA.config && window.FFPWA.config.gpsEnabled) {
            row.classList.remove('hidden');
        } else {
            row.classList.add('hidden');
        }
    }
    window.FFPWA._updateGPSToggleVisibility = updateGPSToggleVisibility;

    /**
     * Envía la transacción al API.
     * Rechaza con un objeto { message, status } para que el caller
     * pueda distinguir entre errores de auth y errores temporales.
     */
    function sendTransaction(payload) {
        const token = window.FFPWA.config.token;
        const url = window.FFPWA.config.url;

        // Limpiar _queueId antes de enviar al servidor (campo interno de la cola)
        const cleanPayload = Object.assign({}, payload);
        delete cleanPayload._queueId;

        console.log('--- Intentando enviar transacción ---', cleanPayload);

        return new Promise((resolve, reject) => {
            window.FFPWA.http({
                url: `${url}/api/v1/transactions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(cleanPayload),
                dataType: 'json',
                timeout: 15000, // 15 segundos máx, si no responde se trata como server caído
                success: function(response) {
                    console.log("✅ Transacción enviada exitosamente.");
                    resolve(true);
                },
                error: function(xhr, textStatus) {
                    var status = xhr.status || 0;
                    var errorMsg;
                    var responseMsg = (xhr.responseJSON && xhr.responseJSON.message) || '';

                    // Timeout (servidor no responde) o error de conexión
                    if (textStatus === 'timeout' || status === 0) {
                        errorMsg = __('transaction.submit_error_temp');
                        console.warn("⏱️ Timeout/error de conexión al enviar transacción.");
                        reject({ message: errorMsg, status: 0, timeout: true });
                        return;
                    }

                    // 422 con "Duplicate" → la transacción ya fue registrada exitosamente.
                    // Tratar como éxito para que syncQueue la elimine de la cola.
                    if (status === 422 && /duplicate/i.test(responseMsg)) {
                        console.log("[DEBUG]: Transacción duplicada, eliminando de la cola.");
                        resolve(true);
                        return;
                    }

                    // Errores de autenticación: no son reintentables
                    if (status === 401 || status === 403) {
                        errorMsg = __('transaction.submit_error_auth');
                        if (responseMsg) {
                            errorMsg += ' ' + responseMsg;
                        }
                        console.error("[DEBUG]: Error de autenticación:", errorMsg, `(HTTP ${status})`);
                        reject({ message: errorMsg, status: status, authError: true });
                        return;
                    }

                    // HTTP error real (4xx, 5xx)
                    errorMsg = __('transaction.submit_error_prefix') + ' ' + xhr.statusText + '.';
                    if (responseMsg) {
                        errorMsg += ' ' + __('transaction.submit_error_details') + ' ' + responseMsg;
                    }
                    console.error("❌ Error de envío:", errorMsg, `(HTTP ${status})`);
                    reject({ message: errorMsg, status: status });
                }
            });
        });
    }

    /**
     * Agrega una transacción a la cola de sincronización offline.
     * Asigna un _queueId único para dedupe (evita duplicación por retries).
     */
    function queueTransaction(payload) {
        let queue = getQueue();
        if (queue.length >= MAX_QUEUE_SIZE) {
            console.warn('⚠️ Cola llena (' + MAX_QUEUE_SIZE + '). No se puede encolar más.');
            showStatusMessage('❌ ' + __('sync.queue_full'), 'error');
            return;
        }
        // ID único para dedupe: si el mismo payload ya está en cola, no encolar de nuevo
        payload._queueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        queue.push(payload);
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        console.log(`🟡 Transacción encolada (_queueId: ${payload._queueId}). Cola actual: ${queue.length} ítems.`);

        showStatusMessage('💾 ' + __('sync.queued'), 'warning');

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
     * Lock con isSyncing para prevenir ejecuciones simultáneas (race condition).
     */
    async function syncQueue() {
        // Lock: si ya hay un sync en progreso, no iniciar otro
        if (isSyncing) {
            console.log('🔒 Sync ya en progreso, saltando.');
            return;
        }

        const queue = getQueue();
        if (queue.length === 0) {
            console.log('📦 ' + __('sync.queue_empty'));
            return;
        }

        if (!navigator.onLine) {
            console.warn('❌ ' + __('sync.fail_no_connection'));
            return;
        }

        isSyncing = true;
        showStatusMessage('🔄 ' + __('sync.progress', { count: queue.length }), 'warning');

        const remaining = [];
        const sentIds = new Set(); // Track de _queueIds ya enviados en esta ejecución
        let successfulSends = 0;
        let failedSends = 0;
        let authBlocked = false;

        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];

            // Dedupe: si ya enviamos este _queueId en esta ejecución, saltar
            if (item._queueId && sentIds.has(item._queueId)) {
                console.log(`🔄 Skip duplicado en cola: ${item._queueId}`);
                continue;
            }
            if (item._queueId) {
                sentIds.add(item._queueId);
            }

            try {
                await sendTransaction(item);
                successfulSends++;
            } catch (e) {
                // Errores de autenticación: conservar en la cola y cortar el loop.
                // Cuando el usuario actualice el token en Config, se reintentarán.
                if (e.authError) {
                    console.error(`[DEBUG]: Auth error en tx #${i + 1}:`, e.message);
                    authBlocked = true;
                    // Conservar esta transacción y todas las restantes sin intentar
                    remaining.push(item);
                    for (let j = i + 1; j < queue.length; j++) {
                        remaining.push(queue[j]);
                    }
                    failedSends = queue.length - successfulSends;
                    break;
                }
                console.error(`[DEBUG]: Falló tx #${i + 1}:`, e.message);
                remaining.push(item);
                failedSends++;
            }
        }

        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remaining));
        isSyncing = false;

        let message = '';
        if (authBlocked) {
            message += '🔐 ' + __('sync.auth_blocked') + ' ';
            window.FFPWA.updateStatus('server_down');
            fireflyServerAvailable = false;
        }
        if (successfulSends > 0) {
            message += __('sync.sent', { count: successfulSends }) + ' ';
        }
        if (failedSends > 0 && !authBlocked) {
            message += __('sync.failed', { count: failedSends });
            showStatusMessage(message, 'warning');
        } else if (authBlocked) {
            showStatusMessage(message, 'warning');
        } else {
            message = message || __('sync.complete');
            showStatusMessage(message, 'success');
        }

        // Si la cola quedó vacía, detener health check
        if (remaining.length === 0 && healthCheckIntervalId) {
            stopFireflyHealthCheck();
        } else if (remaining.length > 0) {
            // Si quedaron items pendientes, asegurar health check activo para reintentar
            startFireflyHealthCheck();
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
            window.FFPWA.http({
                url: `${url}/api/v1/about`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 10000,
                success: function() {
                    const wasDown = !fireflyServerAvailable;
                    fireflyServerAvailable = true;
                    // Siempre actualizar el badge — si estaba en 'checking' (por visibilitychange,
                    // BACKGROUND_SYNC, etc.) necesita restaurarse a 'online'.
                    window.FFPWA.updateStatus('online');
                    if (wasDown) {
                        console.log('[HEALTH] ✅ Servidor Firefly disponible de nuevo.');
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
                        fireflyServerAvailable = false;
                    }
                    // Siempre actualizar badge, incluso si ya estaba marcado como caído
                    // (el badge pudo haber sido sobrescrito por online event o init)
                    window.FFPWA.updateStatus('server_down');
                    resolve(false);
                }
            });
        });
    }
    window.FFPWA.checkFireflyHealth = checkFireflyHealth;

    /**
     * Inicia el health check periódico.
     * - Si hay items en cola: cada 1 minuto.
     * - Sin items en cola: cada 5 minutos.
     * Si ya está corriendo con el intervalo lento y hay items pendientes, lo reinicia.
     */
    function startFireflyHealthCheck() {
        const pendingCount = getQueue().length;
        const targetInterval = pendingCount > 0 ? HEALTH_CHECK_INTERVAL_ACTIVE : HEALTH_CHECK_INTERVAL;

        // Si ya está corriendo, solo reiniciar si hay items pendientes y el intervalo es el lento
        if (healthCheckIntervalId) {
            if (pendingCount > 0) {
                console.log('[HEALTH] Items pendientes, cambiando a intervalo rápido (' + (targetInterval / 1000) + 's).');
                stopFireflyHealthCheck();
            } else {
                console.log('[HEALTH] Health check ya estaba corriendo.');
                return;
            }
        }

        console.log('[HEALTH] Iniciando health check cada ' + (targetInterval / 1000) + 's. Pendientes: ' + pendingCount);
        // Hacer una verificación inmediata primero
        checkFireflyHealth();
        healthCheckIntervalId = setInterval(checkFireflyHealth, targetInterval);
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
     * Siempre encola la transacción y libera la UI de inmediato.
     * El envío al servidor ocurre en background vía syncQueue.
     */
    async function handleTransactionSubmit(e) {
        e.preventDefault();

        let transactionPayload = null;
        try {
            transactionPayload = await buildTransactionPayload();
        } catch (error) {
            showStatusMessage('❌ ' + error.message, 'error');
            return;
        }

        const btn = document.getElementById('submit-transaction-btn');
        if (btn) { btn.disabled = true; btn.textContent = __('transaction.submit_sending'); }

        // Siempre encolar — la UI se libera al instante.
        queueTransaction(transactionPayload);
        resetTransactionForm();
        if (btn) { btn.disabled = false; btn.textContent = __('transaction.submit_btn'); }

        // Disparar sync en background si hay conexión.
        if (navigator.onLine) {
            // Pequeño delay para que el status message del queue se muestre primero
            setTimeout(function() {
                syncQueue();
            }, 300);
        }
    }

    function domReady() {
        document.addEventListener('submit', function(e) {
            if (e.target && e.target.id === 'transaction-form') {
                handleTransactionSubmit(e);
            }
        });

        // ── Network / visibility handlers ──
        window.FFPWA._onOnline = function() {
            console.log('[NETWORK]: Online. Verificando servidor...');
            window.FFPWA.updateStatus('checking');
            checkFireflyHealth().then(function(available) {
                if (available) {
                    window.FFPWA.updateStatus('online');
                    fireflyServerAvailable = true;
                    syncQueue();
                } else {
                    window.FFPWA.updateStatus('server_down');
                    fireflyServerAvailable = false;
                }
            });
        };

        window.FFPWA._onOffline = function() {
            window.FFPWA.updateStatus('offline');
            console.log('[NETWORK]: Offline. Modo desconectado.');
        };

        window.FFPWA._onVisibilityChange = function() {
            // health check inmediato si hay cola pendiente
            if (!document.hidden && getQueue().length > 0) {
                console.log('[HEALTH] Usuario volvió a la PWA. Verificando servidor...');
                window.FFPWA.updateStatus('checking');
                checkFireflyHealth().then(function(available) {
                    if (available) {
                        fireflyServerAvailable = true;
                        syncQueue();
                    } else {
                        fireflyServerAvailable = false;
                        window.FFPWA.updateStatus('server_down');
                    }
                });
            }

            // refrescar ubicación GPS
            if (!document.hidden && window.FFPWA.config && window.FFPWA.config.gpsEnabled) {
                window.FFPWA.getLocation().then(function(loc) {
                    if (loc) window.FFPWA.lastLocation = loc;
                });
            }
        };

        // Periodic network poll (events are unreliable in some PWA scenarios)
        setInterval(function() {
            if (!navigator.onLine) {
                window.FFPWA.updateStatus('offline');
            }
        }, 15000);

        // Escuchar mensajes del Service Worker (Background Sync)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'BACKGROUND_SYNC') {
                    console.log(`[CLIENT] Recibido BACKGROUND_SYNC del SW (tag: ${event.data.tag}). Verificando servidor...`);
                    window.FFPWA.updateStatus('checking');
                    checkFireflyHealth().then(function(available) {
                        if (available) {
                            syncQueue();
                        }
                    });
                }
            });
        }

        // Iniciar health check para monitorear disponibilidad del servidor
        const pendingQueue = getQueue();
        if (pendingQueue.length > 0) {
            console.log(`[INIT] ${pendingQueue.length} transacción(es) pendiente(s) en la cola.`);
            fireflyServerAvailable = false;
            window.FFPWA.updateStatus('server_down');
        }
        // Siempre iniciar health check para monitoreo continuo;
        // si no hay items pendientes, se detendrá automáticamente
        // al detectar que el servidor responde y la cola está vacía.
        startFireflyHealthCheck();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', domReady);
    } else {
        domReady();
    }

})();