(function() {
    'use strict';

    const QUEUE_STORAGE_KEY = 'firefly_transaction_queue';

    window.FFPWA = window.FFPWA || {};

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
     * Si el usuario no ingresó cuenta origen, usar la default registrada.
     */
    function resolveSourceAccount() {
        let sourceId = $('#source-account-id').val();
        let sourceName = $('#source-account-name').val();

        // Si el usuario ya escribió algo, respetarlo
        if (sourceName && sourceName.trim()) {
            return { id: sourceId, name: sourceName };
        }

        // Fallback: usar la cuenta default
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;
        if (defaultAccount && defaultAccount.id) {
            // Pre-fill visual
            const defaultName = defaultAccount.name;
            $('#source-account').val(defaultName);
            $('#source-account-id').val(defaultAccount.id);
            $('#source-account-name').val(defaultName);
            return { id: String(defaultAccount.id), name: defaultName };
        }

        return { id: null, name: null };
    }

    /**
     * Recopila y transforma los datos del formulario en el formato JSON requerido por Firefly III.
     */
    function buildTransactionPayload() {
        const source = resolveSourceAccount();
        const sourceId = source.id;
        const sourceName = source.name;
        const destId = $('#destination-account-id').val();
        const destName = $('#destination-account-name').val();

        if (!sourceName || !destName) {
            throw new Error('Por favor, selecciona o ingresa nombres de cuenta válidos para ambas fuentes.');
        }

        const amount = validateAndFormatAmount();

        return {
            "error_if_duplicate_hash": true,
            "apply_rules": true,
            "transactions": [{
                "type": "withdrawal",
                "description": $('#description').val().trim() || "Transacción sin descripción",
                "date": new Date().toISOString(),
                "amount": amount,
                "source_id": (sourceId && sourceId !== "") ? sourceId : null,
                "source_name": (sourceName && sourceName !== "") ? sourceName : null,
                "destination_id": (destId && destId !== "") ? destId : null,
                "destination_name": (destName && destName !== "") ? destName : null
            }]
        };
    }

    /**
     * Limpia el formulario y re-prefill source con la cuenta default.
     */
    function resetTransactionForm() {
        $('#transaction-form')[0].reset();
        $('#source-account-id').val('');
        $('#source-account-name').val('');
        $('#destination-account-id').val('');
        $('#destination-account-name').val('');

        // Restaurar cuenta origen default si existe
        const defaultAccount = window.FFPWA.config.defaultSourceAccount;
        if (defaultAccount && defaultAccount.id) {
            $('#source-account').val(defaultAccount.name);
            $('#source-account-id').val(defaultAccount.id);
            $('#source-account-name').val(defaultAccount.name);
        }
    }

    /**
     * Envía la transacción al API.
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
                    console.error("❌ Error de envío:", errorMsg);
                    reject(new Error(errorMsg));
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
    }
    window.FFPWA.syncQueue = syncQueue;

    /**
     * Maneja el envío del formulario de transacción.
     */
    function handleTransactionSubmit(e) {
        e.preventDefault();

        let transactionPayload = null;
        try {
            transactionPayload = buildTransactionPayload();
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
                })
                .catch(error => {
                    showStatusMessage(`🛑 Falló el envío: ${error.message}`, 'error');
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

        window.addEventListener('online', () => {
            window.FFPWA.updateStatus('🟢 Online');
            console.log('[NETWORK]: Online. Sincronizando cola...');
            syncQueue();
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
                    syncQueue();
                }
            });
        }
    });

})();
