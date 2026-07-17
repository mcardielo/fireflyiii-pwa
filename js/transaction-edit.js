/**
 * transaction-edit.js — Detail / edit view for a single transaction
 */
(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    /* ─── State ─── */

    var currentEditGroupId = null;
    var currentEditTxData = null;
    var editBudgets = [];
    var editCategories = [];
    var isDuplicating = false;

    /* ─── Public entry point ─── */

    window.FFPWA.showTransactionEdit = function(groupId, txIdx, groupTitle, reconciled) {
        if (groupTitle) {
            window.FFPWA.showStatusMessage(__('history.edit_no_group'), 'warning');
            return;
        }

        // Immediately show loading state so old data doesn't linger
        var historyFilters = document.getElementById('history-filters');
        var historyListView = document.getElementById('history-list-view');
        var historyDetail = document.getElementById('history-detail');
        var historyDetailSummary = document.getElementById('history-detail-summary');
        if (historyFilters) historyFilters.classList.add('hidden');
        if (historyListView) historyListView.classList.add('hidden');
        if (historyDetail) historyDetail.classList.remove('hidden');
        if (historyDetailSummary) historyDetailSummary.innerHTML =
            '<div class="text-center py-8">' +
                '<div class="spinner mx-auto mb-2"></div>' +
                '<p class="text-sm text-ios-text-secondary">' + __('history.loading_tx') + '</p>' +
            '</div>';

        // Reset background por si venía de otra tx con mapa
        var mapBtnContainer = document.getElementById('map-open-btn-container');
        if (mapBtnContainer) mapBtnContainer.classList.add('hidden');
        if (historyDetailSummary) {
            historyDetailSummary.style.backgroundImage = '';
            historyDetailSummary.style.backgroundSize = '';
            historyDetailSummary.style.backgroundPosition = '';
            historyDetailSummary.style.borderRadius = '';
            historyDetailSummary.style.padding = '';
        }

        // Clear form to prevent old data flash
        var form = document.getElementById('history-edit-form');
        if (form) form.reset();
        if (form) form.classList.add('hidden');

        fetchTransactionGroup(groupId).then(function(groupData) {
            var tx = groupData.transactions && groupData.transactions[txIdx];
            if (!tx) {
                window.FFPWA.showStatusMessage(__('history.edit_no_data'), 'error');
                return;
            }

            currentEditGroupId = groupId;
            currentEditTxData = tx;

            showTransactionDetail(tx, { reconciled: reconciled });
        }).catch(function(err) {
            window.FFPWA.showStatusMessage('❌ ' + err.message, 'error');
        });
    };

    /* ─── Fetch single transaction group ─── */

    function fetchTransactionGroup(groupId) {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        return new Promise(function(resolve, reject) {
            window.FFPWA.http({
                url: url + '/api/v1/transactions/' + groupId,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 15000,
                success: function(response) {
                    var attrs = (response.data && response.data.attributes) || {};
                    resolve({
                        id: response.data.id,
                        transactions: attrs.transactions || []
                    });
                },
                error: function(xhr) {
                    var msg = __('detail.error_fetch');
                    if (xhr.status === 401) msg += ' ' + __('setup.token_401');
                    else if (xhr.status === 0) msg += ' ' + __('setup.no_connection');
                    else msg += ' (HTTP ' + xhr.status + ')';
                    reject(new Error(msg));
                }
            });
        });
    }

    /* ─── Fetch autocomplete data ─── */
    var fetchBudgets = function() { return window.FFPWA.lookups.fetchBudgets(); };
    var fetchCategories = function() { return window.FFPWA.lookups.fetchCategories(); };

    /* ─── Show/hide views ─── */

    function showTransactionDetail(tx, opts) {
        opts = opts || {};
        var reconciled = opts.reconciled === true;

        var historyListView = document.getElementById('history-list-view');
        var historyDetail = document.getElementById('history-detail');
        if (historyListView) historyListView.classList.add('hidden');
        if (historyDetail) historyDetail.classList.remove('hidden');
        isDuplicating = false;

        var deleteBtn = document.getElementById('history-delete-btn');
        if (deleteBtn) deleteBtn.classList.toggle('hidden', reconciled);

        var type = tx.type || 'withdrawal';
        var amount = parseFloat(tx.amount) || 0;
        var symbol = tx.currency_symbol || '$';
        var decimals = tx.currency_decimal_places || 2;
        var description = tx.description || __('detail.no_description');
        var dateStr = tx.date || '';
        var sourceName = tx.source_name || '';
        var destName = tx.destination_name || '';

        var typeLabel = __('transaction.' + type);
        var typeIconHtml = type === 'withdrawal' ? Icons.banknoteArrowUp : (type === 'deposit' ? Icons.banknoteArrowDown : Icons.arrowLeftRight);
        var sign = type === 'withdrawal' ? '-' : '+';
        var colorClass = type === 'withdrawal' ? 'text-ios-red' : (type === 'deposit' ? 'text-ios-green' : 'text-ios-orange');

        // Badge: "Conciliado" for reconciled, "Editable" otherwise
        var badgeHtml = reconciled
            ? '<span class="text-[12px] text-ios-orange font-medium flex items-center" style="gap:4px;">' +
                Icons.checkCheck + ' <span data-i18n="history.reconciled">Conciliado</span></span>'
            : '<span class="text-[12px] text-ios-green font-medium flex items-center" style="gap:4px;">' +
                Icons.pencil + ' <span data-i18n="history.editable">Editable</span></span>';

        var summaryHtml =
            '<div class="flex items-center justify-between" style="margin-bottom:12px;">' +
                '<span class="text-[12px] font-semibold uppercase tracking-wide text-ios-text-secondary flex items-center" style="gap:6px;">' +
                    typeIconHtml + '<span>' + window.FFPWA.escapeHtml(typeLabel) + '</span>' +
                '</span>' + badgeHtml +
            '</div>' +
            '<div style="height:1px;background:var(--ios-separator);margin:0 0 14px 0;"></div>' +
            '<div id="map-open-btn-container" class="hidden" style="margin-bottom:10px;text-align:-webkit-right;">' +
                '<button id="map-open-btn" class="flex items-center ios-link-btn" style="gap:5px;font-size:13px;background:transparent;color: var(--ios-text);border:1px solid var(--ios-text);border-radius:8px;padding:6px 14px;cursor:pointer;">' +
                    Icons.mapPin + ' <span data-i18n="history.open_in_maps">' + __('history.open_in_maps') + '</span>' +
                '</button>' +
            '</div>' +
            '<p class="text-[17px] font-semibold text-ios-text">' + window.FFPWA.escapeHtml(description) + '</p>' +
            '<p class="text-[28px] font-bold ' + colorClass + '">' +
                sign + ' ' + window.FFPWA.formatMoney(Math.abs(amount), symbol, decimals) +
            '</p>' +
            '<p class="text-[13px] text-ios-text-secondary">' +
                window.FFPWA.escapeHtml(window.FFPWA.formatDate(dateStr)) + ' · ' + window.FFPWA.escapeHtml(sourceName) + ' → ' + window.FFPWA.escapeHtml(destName) +
            '</p>';

        var summaryEl = document.getElementById('history-detail-summary');
        if (summaryEl) summaryEl.innerHTML = summaryHtml;

        // ── Mapa de fondo si la transacción tiene ubicación GPS ──
        if (tx.latitude && tx.longitude) {
            var bgZoom = 15;
            var n = Math.pow(2, bgZoom);
            var tileX = Math.floor((tx.longitude + 180) / 360 * n);
            var latRad = tx.latitude * Math.PI / 180;
            var tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

            var tileUrl = 'https://tile.openstreetmap.org/' + bgZoom + '/' + tileX + '/' + tileY + '.png';

            var isDark = window.FFPWA.theme && window.FFPWA.theme.getCurrent() === 'dark';
            var overlayColor = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)';

            if (summaryEl) {
                summaryEl.style.backgroundImage = 'linear-gradient(' + overlayColor + ', ' + overlayColor + '), url(' + tileUrl + ')';
                summaryEl.style.backgroundSize = 'cover';
                summaryEl.style.backgroundPosition = 'center';
                summaryEl.style.borderRadius = '14px';
                summaryEl.style.padding = '16px';
                summaryEl.style.position = 'relative';
            }
            
            // Mostrar botón para abrir en Maps
            var mapBtnContainer2 = document.getElementById('map-open-btn-container');
            if (mapBtnContainer2) mapBtnContainer2.classList.remove('hidden');
            var mapBtn = document.getElementById('map-open-btn');
            if (mapBtn) {
                // Clone to remove old listeners
                var newMapBtn = mapBtn.cloneNode(true);
                mapBtn.parentNode.replaceChild(newMapBtn, mapBtn);
                newMapBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var mapsUrl = 'https://www.openstreetmap.org/?mlat=' + tx.latitude + '&mlon=' + tx.longitude + '&zoom=' + tx.zoom_level;
                    window.open(mapsUrl, '_blank');
                });
            }

            console.log('🗺️ Mapa de fondo aplicado (OSM tile):', tx.latitude, tx.longitude, 'zoom', bgZoom);
        }

        // Restore delete and save buttons to clean state
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = Icons.trash2 + ' <span data-i18n="history.delete_btn">' + __('history.delete_btn') + '</span>';
        }
        var duplicateBtn = document.getElementById('history-duplicate-btn');
        if (duplicateBtn) {
            duplicateBtn.disabled = false;
            duplicateBtn.classList.remove('hidden');
            duplicateBtn.innerHTML = Icons.copy + ' <span data-i18n="history.duplicate_btn">' + __('history.duplicate_btn') + '</span>';
        }
        var saveBtn = document.getElementById('history-save-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span data-i18n="history.save">' + __('history.save') + '</span>';
        }

        var editForm = document.getElementById('history-edit-form');
        if (editForm) editForm.classList.remove('hidden');
        var editStatusMsg = document.getElementById('edit-status-message');
        if (editStatusMsg) editStatusMsg.classList.add('hidden');

        if (reconciled) {
            populateForm(tx, { readOnly: true });
            if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        } else {
            Promise.all([fetchBudgets(), fetchCategories()]).then(function(results) {
                editBudgets = results[0] || [];
                editCategories = results[1] || [];
                populateBudgetDropdown();
                populateForm(tx, { readOnly: false });
                setupEditAutocomplete();
                if (window.i18nTranslateDOM) window.i18nTranslateDOM();
            }).catch(function() {
                editBudgets = [];
                editCategories = [];
                populateForm(tx, { readOnly: false });
                setupEditAutocomplete();
                if (window.i18nTranslateDOM) window.i18nTranslateDOM();
            });
        }
    }

    /* ─── Budget dropdown ─── */

    function populateBudgetDropdown() {
        var select = document.getElementById('edit-budget');
        if (!select) return;
        select.innerHTML = '<option value="">—</option>';
        editBudgets.forEach(function(b) {
            var opt = document.createElement('option');
            opt.value = String(b.id);
            opt.textContent = b.name;
            select.appendChild(opt);
        });
    }

    /* ─── Populate form ─── */

    function populateForm(tx, opts) {
        opts = opts || {};
        var readOnly = opts.readOnly === true;

        var dateStr = tx.date || '';
        var datePart = dateStr.split('T')[0] || '';
        var timePart = '';
        if (dateStr.indexOf('T') !== -1) {
            var timeMatch = dateStr.split('T')[1];
            if (timeMatch) timePart = timeMatch.substring(0, 5);
        }

        var amount = parseFloat(tx.amount) || 0;
        var foreignAmt = parseFloat(tx.foreign_amount);

        // Readonly: ensure budget dropdown has data from tx data
        var budgetSelect = document.getElementById('edit-budget');
        if (readOnly && budgetSelect && budgetSelect.options.length <= 1 && tx.budget_name) {
            budgetSelect.innerHTML = '<option value="">—</option>';
            var opt = document.createElement('option');
            opt.value = String(tx.budget_id || '');
            opt.textContent = tx.budget_name;
            opt.selected = true;
            budgetSelect.appendChild(opt);
        }

        // Set disabled state on all form inputs
        var form = document.getElementById('history-edit-form');
        if (form) {
            form.querySelectorAll('.ios-input, .ios-select').forEach(function(el) {
                el.disabled = readOnly;
                el.style.opacity = readOnly ? '0.7' : '1';
            });
        }

        // Fill all fields
        var setVal = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.value = val || '';
        };
        setVal('edit-description', tx.description || '');
        setVal('edit-source-account', tx.source_name || '');
        setVal('edit-source-account-id', tx.source_id || '');
        setVal('edit-source-account-name', tx.source_name || '');
        setVal('edit-dest-account', tx.destination_name || '');
        setVal('edit-dest-account-id', tx.destination_id || '');
        setVal('edit-dest-account-name', tx.destination_name || '');
        setVal('edit-date', datePart);
        setVal('edit-time', timePart);

        var editAmount = document.getElementById('edit-amount');
        if (editAmount) editAmount.value = Math.abs(amount);
        var editCurrencyCode = document.getElementById('edit-currency-code');
        if (editCurrencyCode) editCurrencyCode.textContent = tx.currency_code || '';

        // Foreign amount
        var editForeignAmount = document.getElementById('edit-foreign-amount');
        if (!isNaN(foreignAmt) && foreignAmt !== 0) {
            if (editForeignAmount) editForeignAmount.value = Math.abs(foreignAmt);
        } else {
            if (editForeignAmount) editForeignAmount.value = '';
        }
        setVal('edit-foreign-currency', tx.foreign_currency_code || '');

        // Budget
        var editBudget = document.getElementById('edit-budget');
        if (editBudget) editBudget.value = tx.budget_id || '';

        // Category
        setVal('edit-category', tx.category_name || '');

        // Foreign row visibility
        var foreignRow = document.getElementById('edit-foreign-row');
        if (foreignRow) {
            if (tx.foreign_amount || tx.foreign_currency_code) {
                foreignRow.classList.remove('hidden');
            } else {
                foreignRow.classList.add('hidden');
            }
        }

        // Save button and status
        var saveBtn = document.getElementById('history-save-btn');
        if (saveBtn) saveBtn.classList.toggle('hidden', readOnly);
        var editStatusMsg = document.getElementById('edit-status-message');
        if (editStatusMsg) editStatusMsg.classList.add('hidden');
    }

    /* ─── Build update payload ─── */

    function buildUpdatePayload(tx) {
        var transactionType = tx.type || 'withdrawal';
        var getVal = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
        var sourceId = getVal('edit-source-account-id') || null;
        var sourceName = getVal('edit-source-account-name') || getVal('edit-source-account') || '';
        var destId = getVal('edit-dest-account-id') || null;
        var destName = getVal('edit-dest-account-name') || getVal('edit-dest-account') || '';
        var dateVal = getVal('edit-date') || '';
        var timeVal = getVal('edit-time') || '00:00';
        var dateTime = dateVal + 'T' + timeVal + ':00';
        var amount = parseFloat(getVal('edit-amount')) || 0;
        var foreignAmount = getVal('edit-foreign-amount');
        var foreignCurrency = getVal('edit-foreign-currency');
        var budgetId = getVal('edit-budget');
        var categoryName = getVal('edit-category').trim() || null;

        var transaction = {
            "type": transactionType,
            "date": dateTime,
            "amount": String(amount),
            "description": (getVal('edit-description') || '').trim() || __('transaction.no_description')
        };

        if (sourceId && sourceId !== '') {
            transaction.source_id = sourceId;
        } else {
            transaction.source_name = sourceName;
        }

        if (destId && destId !== '') {
            transaction.destination_id = destId;
        } else {
            transaction.destination_name = destName;
        }

        if (foreignAmount && parseFloat(foreignAmount) > 0 && foreignCurrency) {
            transaction.foreign_amount = String(parseFloat(foreignAmount));
            transaction.foreign_currency_code = foreignCurrency;
        }

        if (budgetId && budgetId !== '') {
            transaction.budget_id = budgetId;
        }

        if (categoryName) {
            transaction.category_name = categoryName;
        }

        // ── GPS location (solo en duplicación, no en edición) ──
        if (window.FFPWA.config.gpsEnabled && window.FFPWA.lastLocation && isDuplicating) {
            transaction.latitude = window.FFPWA.lastLocation.latitude;
            transaction.longitude = window.FFPWA.lastLocation.longitude;
            transaction.zoom_level = window.FFPWA.lastLocation.zoom_level;
        }

        return { "transactions": [transaction] };
    }

    /* ─── Save handler ─── */

    function saveTransaction(e) {
        e.preventDefault();

        var tx = currentEditTxData;
        if (!tx) return;
        if (!isDuplicating && !currentEditGroupId) return;

        var payload = buildUpdatePayload(tx);

        var btn = document.getElementById('history-save-btn');
        var status = document.getElementById('edit-status-message');
        if (btn) { btn.disabled = true; btn.textContent = __('transaction.submit_sending'); }
        if (status) status.classList.add('hidden');

        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        var endpoint = isDuplicating
            ? url + '/api/v1/transactions'
            : url + '/api/v1/transactions/' + currentEditGroupId;
        var method = isDuplicating ? 'POST' : 'PUT';

        window.FFPWA.http({
            url: endpoint,
            method: method,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload),
            dataType: 'json',
            timeout: 30000,
            success: function() {
                var msg = isDuplicating ? 'history.duplicate_success' : 'history.edit_saved';
                if (status) {
                    status.classList.remove('hidden', 'error');
                    status.classList.add('success');
                    status.innerHTML = '✅ ' + __(msg);
                }
                if (btn) { btn.disabled = false; btn.innerHTML = __('history.saved_btn'); }
                currentEditTxData = null;
                currentEditGroupId = null;
                isDuplicating = false;

                setTimeout(function() {
                    goBackToList(true);
                }, 1500);
            },
            error: function(xhr) {
                var msg = __('history.edit_error');
                if (xhr.status === 401 || xhr.status === 403) {
                    msg += ' ' + __('transaction.submit_error_auth');
                } else if (xhr.status === 0) {
                    msg += ' ' + __('setup.no_connection');
                } else {
                    msg += ' (HTTP ' + xhr.status + ')';
                }
                if (status) {
                    status.classList.remove('hidden', 'success');
                    status.classList.add('error');
                    status.innerHTML = '❌ ' + msg;
                }
                if (btn) { btn.disabled = false; btn.innerHTML = __('history.save'); }
            }
        });
    }

    /* ─── Delete handler ─── */

    function deleteTransaction() {
        if (!currentEditGroupId) return;

        var overlay = document.getElementById('delete-confirm-overlay');
        if (!overlay) {
            // Create confirmation overlay on-demand
            var overlayHtml =
                '<div id="delete-confirm-overlay" class="fixed inset-0 z-[200] flex items-end justify-center" style="background:rgba(0,0,0,0.4);">' +
                    '<div class="w-full rounded-t-[20px] p-6" style="background:var(--ios-card);padding-bottom:calc(24px + env(safe-area-inset-bottom));">' +
                        '<h3 class="text-[17px] font-semibold text-center text-ios-text mb-2" data-i18n="history.delete_confirm_title">' + __('history.delete_confirm_title') + '</h3>' +
                        '<p class="text-[13px] text-center text-ios-red mb-6" data-i18n="history.delete_confirm_body">' + __('history.delete_confirm_body') + '</p>' +
                        '<button id="delete-confirm-cancel" class="ios-btn-primary mb-2">' + __('history.delete_confirm_cancel') + '</button>' +
                        '<button id="delete-confirm-ok" class="ios-btn-danger">' + __('history.delete_confirm_ok') + '</button>' +
                    '</div>' +
                '</div>';
            document.body.insertAdjacentHTML('beforeend', overlayHtml);
            overlay = document.getElementById('delete-confirm-overlay');

            // Cancel button
            overlay.addEventListener('click', function(e) {
                if (e.target.closest('#delete-confirm-cancel')) {
                    overlay.remove();
                }
            });

            // Click outside
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    overlay.remove();
                }
            });

            // Confirm button
            overlay.addEventListener('click', function(e) {
                if (e.target.closest('#delete-confirm-ok')) {
                    overlay.remove();
                    executeDelete();
                }
            });
        }
    }

    function executeDelete() {
        var btn = document.getElementById('history-delete-btn');
        var status = document.getElementById('edit-status-message');
        if (btn) btn.disabled = true;
        var btnLabel = btn ? btn.querySelector('[data-i18n="history.delete_btn"]') : null;
        if (btnLabel) btnLabel.textContent = __('transaction.submit_sending');
        if (status) status.classList.add('hidden');

        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        window.FFPWA.http({
            url: url + '/api/v1/transactions/' + currentEditGroupId,
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            timeout: 15000,
            success: function() {
                if (status) {
                    status.classList.remove('hidden', 'error');
                    status.classList.add('success');
                    status.innerHTML = '🗑️ ' + __('history.delete_success');
                }
                currentEditTxData = null;
                currentEditGroupId = null;

                setTimeout(function() {
                    goBackToList(true);
                }, 1500);
            },
            error: function(xhr) {
                var msg = __('history.delete_error');
                if (xhr.status === 401 || xhr.status === 403) {
                    msg += ' ' + __('transaction.submit_error_auth');
                } else if (xhr.status === 404) {
                    msg += ' ' + __('history.delete_error_404');
                } else if (xhr.status === 0) {
                    msg += ' ' + __('setup.no_connection');
                } else {
                    msg += ' (HTTP ' + xhr.status + ')';
                }
                if (status) {
                    status.classList.remove('hidden', 'success');
                    status.classList.add('error');
                    status.innerHTML = '❌ ' + msg;
                }
                if (btn) {
                    btn.disabled = false;
                    if (btnLabel) btnLabel.textContent = __('history.delete_btn');
                }
            }
        });
    }

    /* ─── Duplicate handler ─── */

    function duplicateTransaction() {
        isDuplicating = true;

        var form = document.getElementById('history-edit-form');
        // Enable form fields (may be disabled for reconciled transactions)
        if (form) {
            form.querySelectorAll('.ios-input, .ios-select').forEach(function(el) {
                el.disabled = false;
                el.style.opacity = '1';
            });
        }
        var saveBtn = document.getElementById('history-save-btn');
        if (saveBtn) saveBtn.classList.remove('hidden');

        // Hide action buttons
        var deleteBtn = document.getElementById('history-delete-btn');
        var duplicateBtn = document.getElementById('history-duplicate-btn');
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (duplicateBtn) duplicateBtn.classList.add('hidden');

        // Update date/time to current
        var now = new Date();
        var datePart = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
        var timePart = String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');
        var editDate = document.getElementById('edit-date');
        var editTime = document.getElementById('edit-time');
        if (editDate) editDate.value = datePart;
        if (editTime) editTime.value = timePart;

        // Change save button label
        if (saveBtn) saveBtn.innerHTML = '<span data-i18n="history.duplicate_btn">' + __('history.duplicate_btn') + '</span>';

        // Ensure autocomplete + budgets are loaded (reconciled tx skip these)
        if (!editBudgets.length && !editCategories.length) {
            Promise.all([fetchBudgets(), fetchCategories()]).then(function(results) {
                editBudgets = results[0] || [];
                editCategories = results[1] || [];
                populateBudgetDropdown();
                setupEditAutocomplete();
            }).catch(function() {
                setupEditAutocomplete();
            });
        }

        // Show hint
        var statusMsg = document.getElementById('edit-status-message');
        if (statusMsg) {
            statusMsg.classList.remove('hidden', 'error');
            statusMsg.classList.add('success');
            statusMsg.innerHTML = '📋 ' + __('history.duplicating_hint');
        }

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();
    }

    /* ─── Go back to list ─── */

    function goBackToList(refresh) {
        var origin = window.FFPWA._editOrigin || 'history';
        window.FFPWA._editOrigin = null;

        if (origin === 'accounts') {
            // Volver al detalle de cuenta específico
            var historyDetail = document.getElementById('history-detail');
            var historyContainer = document.getElementById('history-container');
            var accountsContainer = document.getElementById('accounts-container');
            var accountsList = document.getElementById('accounts-list');
            var accountDetail = document.getElementById('account-detail');
            if (historyDetail) historyDetail.classList.add('hidden');
            if (historyContainer) historyContainer.style.display = 'none';
            if (accountsContainer) { accountsContainer.style.display = ''; accountsContainer.classList.remove('hidden'); }
            if (accountsList) accountsList.classList.add('hidden');
            if (accountDetail) accountDetail.classList.remove('hidden');
            document.querySelectorAll('#tab-bar .tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
            var accBtn = document.querySelector('#tab-bar .tab-btn[data-screen="accounts"]');
            if (accBtn) accBtn.classList.add('active');
            if (refresh && window.FFPWA.refreshCurrentAccount) {
                window.FFPWA.refreshCurrentAccount();
            }
        } else {
            // Volver al listado del historial
            var historyFilters = document.getElementById('history-filters');
            var historyDetail2 = document.getElementById('history-detail');
            var historyListView = document.getElementById('history-list-view');
            if (historyFilters) historyFilters.classList.remove('hidden');
            if (historyDetail2) historyDetail2.classList.add('hidden');
            if (historyListView) historyListView.classList.remove('hidden');
            if (refresh && window.FFPWA.showHistoryScreen) {
                window.FFPWA.showHistoryScreen();
            }
        }
    }

    /* ─── Autocomplete for edit form (accounts + categories) ─── */

    function isLiabilityType(accountType) {
        return accountType === 'liabilities';
    }

    function getAccountTypeFilter(transactionType, fieldContext) {
        if (transactionType === 'deposit') {
            return fieldContext === 'source' ? ['revenue'] : ['asset', 'liabilities'];
        }
        if (transactionType === 'transfer') {
            return ['asset', 'liabilities'];
        }
        // withdrawal
        return fieldContext === 'source' ? ['asset', 'liabilities'] : ['expense'];
    }

    function setupEditAutocomplete() {
        var cache = window.FFPWA.accountsCache;
        if (!cache) return;

        function getTransactionType() {
            return currentEditTxData ? currentEditTxData.type : 'withdrawal';
        }

        function getEl(id) { return document.getElementById(id); }

        function doAccountFilter(input, dropdown, fieldContext) {
            var query = input.value.trim().toLowerCase();
            if (query.length < 1) {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('visible');
                return;
            }

            var txType = getTransactionType();
            var allowedTypes = getAccountTypeFilter(txType, fieldContext);

            var matches = cache.filter(function(a) {
                return a.active !== false &&
                    allowedTypes.indexOf(a.type) !== -1 &&
                    a.name.toLowerCase().includes(query);
            });

            if (matches.length === 0) {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('visible');
                return;
            }

            var html = '';
            matches.forEach(function(a) {
                html += '<li class="autocomplete-item" data-account-id="' + window.FFPWA.escapeHtml(String(a.id)) + '" ' +
                    'data-account-name="' + window.FFPWA.escapeHtml(a.name) + '">' +
                    '<span>' + window.FFPWA.escapeHtml(a.name) + '</span>' +
                '</li>';
            });
            dropdown.innerHTML = html;

            var rect = input.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = rect.width + 'px';
            dropdown.classList.remove('hidden');
            dropdown.classList.add('visible');
        }

        function doCategoryFilter(input, dropdown) {
            var query = input.value.trim().toLowerCase();
            if (query.length < 1 || editCategories.length === 0) {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('visible');
                return;
            }

            var matches = editCategories.filter(function(c) {
                return c.name.toLowerCase().includes(query);
            });

            if (matches.length === 0) {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('visible');
                return;
            }

            var html = '';
            matches.forEach(function(c) {
                html += '<li class="autocomplete-item" data-category-id="' + window.FFPWA.escapeHtml(String(c.id)) + '" ' +
                    'data-category-name="' + window.FFPWA.escapeHtml(c.name) + '">' +
                    '<span>' + window.FFPWA.escapeHtml(c.name) + '</span>' +
                '</li>';
            });
            dropdown.innerHTML = html;

            var rect = input.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = rect.width + 'px';
            dropdown.classList.remove('hidden');
            dropdown.classList.add('visible');
        }

        // Use a namespaced handler pattern — store reference for removal
        var editHandler = function(e) {
            // Source account input
            if (e.target.id === 'edit-source-account' && (e.type === 'keyup' || (e.type === 'change' && document.activeElement === e.target))) {
                doAccountFilter(e.target, getEl('edit-source-autocomplete'), 'source');
                return;
            }
            if (e.target.id === 'edit-dest-account' && (e.type === 'keyup' || (e.type === 'change' && document.activeElement === e.target))) {
                doAccountFilter(e.target, getEl('edit-dest-autocomplete'), 'destination');
                return;
            }
            if (e.target.id === 'edit-category' && (e.type === 'keyup' || (e.type === 'change' && document.activeElement === e.target))) {
                doCategoryFilter(e.target, getEl('edit-category-autocomplete'));
                return;
            }

            // Mousedown on autocomplete items
            if (e.type === 'mousedown') {
                var srcItem = e.target.closest('#edit-source-autocomplete .autocomplete-item');
                if (srcItem) {
                    e.preventDefault();
                    var srcName = srcItem.getAttribute('data-account-name');
                    var srcId = srcItem.getAttribute('data-account-id');
                    setVal('edit-source-account', srcName);
                    setVal('edit-source-account-id', srcId);
                    setVal('edit-source-account-name', srcName);
                    hideEl('edit-source-autocomplete');
                    return;
                }

                var destItem = e.target.closest('#edit-dest-autocomplete .autocomplete-item');
                if (destItem) {
                    e.preventDefault();
                    var destName = destItem.getAttribute('data-account-name');
                    var destId = destItem.getAttribute('data-account-id');
                    setVal('edit-dest-account', destName);
                    setVal('edit-dest-account-id', destId);
                    setVal('edit-dest-account-name', destName);
                    hideEl('edit-dest-autocomplete');
                    return;
                }

                var catItem = e.target.closest('#edit-category-autocomplete .autocomplete-item');
                if (catItem) {
                    e.preventDefault();
                    var catName = catItem.getAttribute('data-category-name');
                    setVal('edit-category', catName);
                    hideEl('edit-category-autocomplete');
                    return;
                }
            }

            // Click outside to close dropdowns
            if (e.type === 'click') {
                if (!e.target.closest('#edit-source-autocomplete, #edit-source-account')) {
                    hideEl('edit-source-autocomplete');
                }
                if (!e.target.closest('#edit-dest-autocomplete, #edit-dest-account')) {
                    hideEl('edit-dest-autocomplete');
                }
                if (!e.target.closest('#edit-category-autocomplete, #edit-category')) {
                    hideEl('edit-category-autocomplete');
                }
            }
        };

        function setVal(id, val) { var el = document.getElementById(id); if (el) el.value = val; }
        function hideEl(id) { var el = document.getElementById(id); if (el) { el.classList.add('hidden'); el.classList.remove('visible'); } }

        // Remove previous editTx handlers if any
        document.removeEventListener('keyup', editHandler);
        document.removeEventListener('change', editHandler);
        document.removeEventListener('mousedown', editHandler);
        document.removeEventListener('click', editHandler);

        // Add fresh handlers
        document.addEventListener('keyup', editHandler);
        document.addEventListener('change', editHandler);
        document.addEventListener('mousedown', editHandler);
        document.addEventListener('click', editHandler);
    }

    /* ─── Event wiring ─── */

    function domReady() {
        document.addEventListener('click', function(e) {
            if (e.target.closest('#history-detail-back')) {
                goBackToList(false);
            }
        });

        document.addEventListener('submit', function(e) {
            if (e.target && e.target.id === 'history-edit-form') {
                saveTransaction(e);
            }
        });

        document.addEventListener('click', function(e) {
            if (e.target.closest('#history-delete-btn')) {
                deleteTransaction();
            }
        });

        document.addEventListener('click', function(e) {
            if (e.target.closest('#history-duplicate-btn')) {
                duplicateTransaction();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', domReady);
    } else {
        domReady();
    }

    window.FFPWA._onLocaleEdit = function() {
        var historyDetail = document.getElementById('history-detail');
        if (historyDetail && historyDetail.offsetParent !== null && window.i18nTranslateDOM) {
            window.i18nTranslateDOM();
        }
    };

})();