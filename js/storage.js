/**
 * storage.js — Capa de persistencia única (IndexedDB) con espejo en memoria.
 *
 * Reemplaza a localStorage como almacén de datos locales.
 * - Lecturas síncronas: se sirven del espejo en memoria (poblado en init()).
 * - Escrituras write-through: actualizan memoria al instante y persisten a IDB async.
 * - Fallback pre-migración: si una key no está en memoria, se lee de localStorage
 *   (cubre las lecturas que ocurren en tiempo de parseo, antes de init()).
 * - Migración segura: copia las keys conocidas a IDB y SOLO borra de localStorage
 *   una vez confirmada la escritura. Si IDB falla, localStorage queda intacto.
 * - Degradación: si IndexedDB no está disponible, la app sigue funcionando
 *   solo con el espejo en memoria (sin persistencia entre recargas).
 */
(function() {
    'use strict';

    var DB_NAME = 'firefly-pwa';
    var DB_VERSION = 1;
    var STORE_NAME = 'kv';

    // Todas las keys que históricamente vivían en localStorage (fuente única de verdad).
    var MIGRATION_KEYS = [
        'FIREFLY_URL',
        'FIREFLY_TOKEN',
        'FIREFLY_DEFAULT_SOURCE_ACCOUNT',
        'FIREFLY_DEFAULT_DEST_ACCOUNT',
        'FIREFLY_FIELD_VISIBILITY',
        'FIREFLY_GPS_ENABLED',
        'firefly_accounts_cache',
        'firefly_currencies_cache',
        'firefly_exchange_rates',
        'firefly_categories_cache',
        'firefly_budgets_cache',
        'firefly_transaction_queue',
        'firefly_locale',
        'ffpwa_theme',
        'ffpwa_security',
        'ffpwa_auth_method',
        'ffpwa_pin_hash',
        'ffpwa_credential_id',
        'ffpwa_device_salt'
    ];

    var memory = {};     // key -> value (string), espejo de IDB
    var db = null;       // conexión IDB (null si no disponible)
    var initPromise = null;

    /* ─── IndexedDB helpers ─── */

    function openDB() {
        return new Promise(function(resolve, reject) {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB no disponible'));
                return;
            }
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
            req.onblocked = function() {
                console.warn('[storage] open bloqueado por otra pestaña');
            };
        });
    }

    // Escribe/borra en IDB. Devuelve una Promise que resuelve cuando la transacción
    // termina (nunca rechaza: en error se resuelve y loguea para degradar en silencio).
    function persist(key, value) {
        if (!db) return Promise.resolve();
        return new Promise(function(resolve) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                if (value === null) {
                    store.delete(key);
                } else {
                    store.put(value, key);
                }
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); };
                tx.onabort = function() { resolve(); };
            } catch (e) {
                console.warn('[storage] Error persistiendo', key, e);
                resolve();
            }
        });
    }

    function loadAllIntoMemory() {
        if (!db) return Promise.resolve();
        return new Promise(function(resolve) {
            try {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        memory[cursor.key] = cursor.value;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = function() { resolve(); };
            } catch (e) {
                resolve();
            }
        });
    }

    /* ─── Migración desde localStorage (segura) ─── */

    function migrateFromLocalStorage() {
        var pending = [];
        MIGRATION_KEYS.forEach(function(key) {
            var lsVal = null;
            try { lsVal = localStorage.getItem(key); } catch (e) {}

            if (lsVal === null) return;

            if (!memory.hasOwnProperty(key)) {
                // Copiar a IDB y SOLO borrar localStorage si la escritura terminó bien.
                memory[key] = lsVal;
                pending.push(
                    persist(key, lsVal).then(function() {
                        try { localStorage.removeItem(key); } catch (e) {}
                    })
                );
            } else {
                // Ya está en IDB/memoria → gana IDB, solo limpiar la copia vieja.
                try { localStorage.removeItem(key); } catch (e) {}
            }
        });
        return Promise.all(pending);
    }

    /* ─── API pública (espejo de localStorage) ─── */

    function get(key) {
        if (memory.hasOwnProperty(key)) return memory[key];
        // Fallback pre-migración: lecturas que ocurren en tiempo de parseo.
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function set(key, value) {
        var str = (value === null || value === undefined) ? null : String(value);
        memory[key] = str;
        persist(key, str);
    }

    function remove(key) {
        delete memory[key];
        persist(key, null);
    }

    function init() {
        if (initPromise) return initPromise;
        initPromise = openDB()
            .then(function(database) {
                db = database;
                return loadAllIntoMemory();
            })
            .then(function() {
                return migrateFromLocalStorage();
            })
            .catch(function(err) {
                // Sin IDB: la app sigue con el espejo en memoria y el fallback a
                // localStorage (que NO se borró, porque migrate no corrió).
                console.warn('[storage] IndexedDB no disponible, usando solo memoria:', err && err.message);
                db = null;
            });
        return initPromise;
    }

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.storage = {
        get: get,
        set: set,
        remove: remove,
        init: init
    };
})();
