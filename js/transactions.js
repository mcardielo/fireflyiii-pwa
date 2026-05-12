const QUEUE_STORAGE_KEY = 'firefly_transaction_queue';

/**
 * Muestra un mensaje temporal de éxito o advertencia en la interfaz.
 */
function showStatusMessage(message, isSuccess = 'success') {
    const $status = $('#status-message');
    $status.removeClass('hidden bg-green-100 text-green-800 bg-red-100 text-red-800 bg-yellow-100 text-yellow-800').addClass('p-3 rounded-md mb-4 text-sm transition-all');
    
    if (isSuccess === 'success') {
        $status.addClass('bg-green-100 text-green-800');
    } else if (isSuccess === 'warning') {
        $status.addClass('bg-yellow-100 text-yellow-800');
    } else {
        $status.addClass('bg-red-100 text-red-800');
    }
    $status.text(message);
    
    setTimeout(() => {
        $status.addClass('hidden');
    }, 5000);
}

/**
 * Recopila y transforma los datos del formulario en el formato JSON requerido por Firefly III.
 * @returns {Object} El objeto JSON de la transacción.
 * @throws {Error} Si faltan datos obligatorios.
 */
function buildTransactionPayload() {
    // --- Obtener valores brutos ---
    const sourceId = $('#source-account-id').val();
    const sourceName = $('#source-account-name').val();
    const destId = $('#destination-account-id').val();
    const destName = $('#destination-account-name').val();
    
    // Validación simple
    if (!sourceName || !destName) {
        throw new Error("Por favor, selecciona o ingresa nombres de cuenta válidos para ambas fuentes.");
    }

    const payload = {
        "error_if_duplicate_hash": true,
        "apply_rules": true,
        "transactions": [
            {
                "type": "withdrawal", 
                "description": $('#description').val().trim() || "Transacción sin descripción",
                "date": new Date().toISOString(),
                "amount": parseFloat($('#amount').val()).toFixed(2),
                
                "source_id": (sourceId && sourceId !== "") ? sourceId : null,
                "source_name": (sourceName && sourceName !== "") ? sourceName : null,
                "destination_id": (destId && destId !== "") ? destId : null,
                "destination_name": (destName && destName !== "") ? destName : null
            }
        ]
    };

    return payload;
}

/**
 * Envía la transacción al API, manejando la conexión.
 * @param {Object} payload - El payload JSON de la transacción.
 * @param {boolean} isManualSend - Indica si es un intento manual o un intento de sincronización.
 * @returns {Promise<boolean>} Promesa que resuelve con true si el envío fue exitoso.
 */
function sendTransaction(payload, isManualSend = true) {
    const token = window.FIREFLY_CONFIG.token;
    const url = window.FIREFLY_CONFIG.url;

    console.log(`--- Intentando enviar transacción ---`, payload);
    
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
 * Agrega una transacción a la cola de sincronización.
 * @param {Object} payload - El payload JSON de la transacción.
 */
function queueTransaction(payload) {
    let queue = getQueue();
    queue.push(payload);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    console.log(`🟡 Transacción encolada. Cola actual: ${queue.length} ítems.`);
    
    showStatusMessage('💾 Transacción guardada localmente. Se sincronizará cuando haya conexión.', 'bg-yellow-100 text-yellow-800');
}

/**
 * Obtiene la cola de transacciones pendientes de localStorage.
 * @returns {Array<Object>} La cola de transacciones.
 */
function getQueue() {
    const storedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
    return storedQueue ? JSON.parse(storedQueue) : [];
}


/**
 * Intenta procesar y enviar todas las transacciones de la cola.
 * Este es el núcleo de la resiliencia offline.
 */
async function syncQueue() {
    const queue = getQueue();
    if (queue.length === 0) {
        console.log('📦 Cola de sincronización vacía. No hay nada que enviar.');
        return;
    }

    if (!navigator.onLine) {
        console.warn('❌ Intento de sincronización fallido: No hay conexión a internet.');
        return;
    }
    
    showStatusMessage(`🔄 Iniciando sincronización de ${queue.length} transacciones pendientes...`, 'bg-indigo-100 text-indigo-800');

    let successfulSends = 0;
    let failedSends = 0;

    // Itera sobre la cola de forma asíncrona
    for (let i = 0; i < queue.length; i++) {
        const transactionPayload = queue[i];
        try {
            // Intenta enviar
            await sendTransaction(transactionPayload);
            
            // Éxito: Removemos el elemento de la cola
            queue.splice(i, 1);
            successfulSends++;
            i--;
        } catch (e) {
            console.error(`Fallo en la transacción ${i + 1}. Deteniendo sincronización.`, e);
            failedSends++;
            break; 
        }
    }

    // Actualizar localStorage con la cola modificada
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    
    let message = '';
    if (successfulSends > 0) {
        message += `✔️ Sincronización exitosa: ${successfulSends} transacciones enviadas. `;
    }
    if (failedSends > 0) {
        message += `⚠️ ${failedSends} transacciones fallaron y serán reintentadas.`;
    } else if (successfulSends === 0 && queue.length === 0) {
        message = '🔄 Sincronización completada. La cola estaba vacía.';
    } else {
        message = '🔄 Sincronización finalizada.';
    }
    
    showStatusMessage(message, 'bg-green-100 text-green-800');
}


/**
 * Maneja el envío del formulario de transacción.
 * @param {Event} e - El evento de envío del formulario.
 */
function handleTransactionSubmit(e) {
    e.preventDefault();
    
    let transactionPayload = null;
    try {
        transactionPayload = buildTransactionPayload();
    } catch (error) {
        showStatusMessage(`❌ Error de formulario: ${error.message}`, 'bg-red-100 text-red-800');
        return;
    }

    const $btn = $('#submit-transaction-btn');
    $btn.prop('disabled', true).text('Enviando...');

    // Verificar la conexión
    if (navigator.onLine) {
        // Online
        sendTransaction(transactionPayload)
            .then(() => {
                showStatusMessage('✅ Transacción registrada exitosamente.', 'bg-green-100 text-green-800');
                $('#transaction-form')[0].reset();
            })
            .catch(error => {
                showStatusMessage(`🛑 Falló el envío: ${error.message}. Revisa la conexión o los permisos.`, 'bg-red-100 text-red-800');
            })
            .finally(() => {
                $btn.prop('disabled', false).text('Registrar Transacción');
            });
    } else {
        // Offline
        queueTransaction(transactionPayload);
        $btn.prop('disabled', false).text('Registrar Transacción');
    }
}

$(document).ready(function() {
    $('#transaction-form').on('submit', handleTransactionSubmit);

    window.addEventListener('online', () => {
        updateStatus('🟢 Online', 'bg-green-100 text-green-800');
        console.log('DEBUG [NETWORK]: Detectada conexión online. Intentando sincronizar cola...');
        syncQueue(); 
    });

    window.addEventListener('offline', () => {
        updateStatus('🔴 Offline', 'bg-red-100 text-red-800');
        console.log('DEBUG [NETWORK]: Detectada desconexión. Usando modo offline.');
    });
});