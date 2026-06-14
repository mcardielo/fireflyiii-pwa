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
        $('#history-filters').addClass('hidden');
        $('#history-list-view').addClass('hidden');
        $('#history-detail').removeClass('hidden');
        $('#history-detail-summary').html(
            '<div class="text-center py-8">' +
                '<div class="spinner mx-auto mb-2"></div>' +
                '<p class="text-sm text-ios-text-secondary">' + __('history.loading_tx') + '</p>' +
            '</div>'
        );
        // Clear form to prevent old data flash
        $('#history-edit-form')[0].reset();
        $('#history-edit-form').addClass('hidden');

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
            $.ajax({
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

    function fetchBudgets() {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;
        return $.ajax({
            url: url + '/api/v1/autocomplete/budgets',
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token },
            dataType: 'json',
            timeout: 10000
        });
    }

    function fetchCategories() {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;
        return $.ajax({
            url: url + '/api/v1/autocomplete/categories',
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token },
            dataType: 'json',
            timeout: 10000
        });
    }

    /* ─── Show/hide views ─── */

    function showTransactionDetail(tx, opts) {
        opts = opts || {};
        var reconciled = opts.reconciled === true;

        $('#history-list-view').addClass('hidden');
        $('#history-detail').removeClass('hidden');
        isDuplicating = false;

        $('#history-delete-btn').toggleClass('hidden', reconciled);

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
                Icons.checkCheck + ' <span data-i18n="history.readonly">Conciliado</span></span>'
            : '<span class="text-[12px] text-ios-green font-medium flex items-center" style="gap:4px;">' +
                Icons.pencil + ' <span data-i18n="history.editable">Editable</span></span>';

        var summaryHtml =
            '<div class="flex items-center justify-between" style="margin-bottom:12px;">' +
                '<span class="text-[12px] font-semibold uppercase tracking-wide text-ios-text-secondary flex items-center" style="gap:6px;">' +
                    typeIconHtml + '<span>' + window.FFPWA.escapeHtml(typeLabel) + '</span>' +
                '</span>' + badgeHtml +
            '</div>' +
            '<div style="height:1px;background:var(--ios-separator);margin:0 0 14px 0;"></div>' +
            '<p class="text-[17px] font-semibold text-ios-text">' + window.FFPWA.escapeHtml(description) + '</p>' +
            '<p class="text-[28px] font-bold ' + colorClass + '">' +
                sign + ' ' + window.FFPWA.formatMoney(Math.abs(amount), symbol, decimals) +
            '</p>' +
            '<p class="text-[13px] text-ios-text-secondary">' +
                window.FFPWA.escapeHtml(window.FFPWA.formatDate(dateStr)) + ' · ' + window.FFPWA.escapeHtml(sourceName) + ' → ' + window.FFPWA.escapeHtml(destName) +
            '</p>';

        $('#history-detail-summary').html(summaryHtml);

        // Restore delete and save buttons to clean state
        $('#history-delete-btn')
            .prop('disabled', false)
            .html(Icons.trash2 + ' <span data-i18n="history.delete_btn">' + __('history.delete_btn') + '</span>');
        $('#history-duplicate-btn')
            .prop('disabled', false)
            .removeClass('hidden')
            .html(Icons.copy + ' <span data-i18n="history.duplicate_btn">' + __('history.duplicate_btn') + '</span>');
        $('#history-save-btn')
            .prop('disabled', false)
            .html('<span data-i18n="history.save">' + __('history.save') + '</span>');

        $('#history-edit-form').removeClass('hidden');
        $('#edit-status-message').addClass('hidden');

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
        var $select = $('#edit-budget');
        $select.empty().append('<option value="">—</option>');
        editBudgets.forEach(function(b) {
            $select.append('<option value="' + window.FFPWA.escapeHtml(String(b.id)) + '">' + window.FFPWA.escapeHtml(b.name) + '</option>');
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
        if (readOnly && $('#edit-budget option').length <= 1 && tx.budget_name) {
            $('#edit-budget').empty()
                .append('<option value="">—</option>')
                .append('<option value="' + window.FFPWA.escapeHtml(String(tx.budget_id || '')) + '" selected>' + window.FFPWA.escapeHtml(tx.budget_name) + '</option>');
        }

        // Set disabled state on all form inputs
        $('#history-edit-form .ios-input, #history-edit-form .ios-select')
            .prop('disabled', readOnly)
            .css('opacity', readOnly ? '0.7' : '1');

        // Fill all fields
        $('#edit-description').val(tx.description || '');
        $('#edit-source-account').val(tx.source_name || '');
        $('#edit-source-account-id').val(tx.source_id || '');
        $('#edit-source-account-name').val(tx.source_name || '');
        $('#edit-dest-account').val(tx.destination_name || '');
        $('#edit-dest-account-id').val(tx.destination_id || '');
        $('#edit-dest-account-name').val(tx.destination_name || '');
        $('#edit-date').val(datePart);
        $('#edit-time').val(timePart);

        $('#edit-amount').val(Math.abs(amount));
        $('#edit-currency-code').text(tx.currency_code || '');

        // Foreign amount
        if (!isNaN(foreignAmt) && foreignAmt !== 0) {
            $('#edit-foreign-amount').val(Math.abs(foreignAmt));
        } else {
            $('#edit-foreign-amount').val('');
        }
        $('#edit-foreign-currency').val(tx.foreign_currency_code || '');

        // Budget
        if (tx.budget_id) {
            $('#edit-budget').val(tx.budget_id);
        } else {
            $('#edit-budget').val('');
        }

        // Category
        $('#edit-category').val(tx.category_name || '');

        // Foreign row visibility
        if (tx.foreign_amount || tx.foreign_currency_code) {
            $('#edit-foreign-row').removeClass('hidden');
        } else {
            $('#edit-foreign-row').addClass('hidden');
        }

        // Save button and status
        $('#history-save-btn').toggleClass('hidden', readOnly);
        $('#edit-status-message').addClass('hidden');
    }

    /* ─── Build update payload ─── */

    function buildUpdatePayload(tx) {
        var transactionType = tx.type || 'withdrawal';
        var sourceId = $('#edit-source-account-id').val() || null;
        var sourceName = $('#edit-source-account-name').val() || $('#edit-source-account').val() || '';
        var destId = $('#edit-dest-account-id').val() || null;
        var destName = $('#edit-dest-account-name').val() || $('#edit-dest-account').val() || '';
        var dateVal = $('#edit-date').val() || '';
        var timeVal = $('#edit-time').val() || '00:00';
        var dateTime = dateVal + 'T' + timeVal + ':00';
        var amount = parseFloat($('#edit-amount').val()) || 0;
        var foreignAmount = $('#edit-foreign-amount').val();
        var foreignCurrency = $('#edit-foreign-currency').val();
        var budgetId = $('#edit-budget').val();
        var categoryName = $('#edit-category').val().trim() || null;

        var transaction = {
            "type": transactionType,
            "date": dateTime,
            "amount": String(amount),
            "description": $('#edit-description').val().trim() || __('transaction.no_description')
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

        return { "transactions": [transaction] };
    }

    /* ─── Save handler ─── */

    function saveTransaction(e) {
        e.preventDefault();

        var tx = currentEditTxData;
        if (!tx) return;
        if (!isDuplicating && !currentEditGroupId) return;

        var payload = buildUpdatePayload(tx);

        var $btn = $('#history-save-btn');
        var $status = $('#edit-status-message');
        $btn.prop('disabled', true).text(__('transaction.submit_sending'));
        $status.addClass('hidden');

        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        var endpoint = isDuplicating
            ? url + '/api/v1/transactions'
            : url + '/api/v1/transactions/' + currentEditGroupId;
        var method = isDuplicating ? 'POST' : 'PUT';

        $.ajax({
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
                $status.removeClass('hidden error').addClass('success')
                    .html('✅ ' + __(msg));
                $btn.prop('disabled', false).html(__('history.saved_btn'));
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
                $status.removeClass('hidden success').addClass('error')
                    .html('❌ ' + msg);
                $btn.prop('disabled', false).html(__('history.save'));
            }
        });
    }

    /* ─── Delete handler ─── */

    function deleteTransaction() {
        if (!currentEditGroupId) return;

        var $overlay = $('#delete-confirm-overlay');
        if (!$overlay.length) {
            // Create confirmation overlay on-demand
            $('body').append(
                '<div id="delete-confirm-overlay" class="fixed inset-0 z-[200] flex items-end justify-center" style="background:rgba(0,0,0,0.4);">' +
                    '<div class="w-full rounded-t-[20px] p-6" style="background:var(--ios-card);padding-bottom:calc(24px + env(safe-area-inset-bottom));">' +
                        '<h3 class="text-[17px] font-semibold text-center text-ios-text mb-2" data-i18n="history.delete_confirm_title">' + __('history.delete_confirm_title') + '</h3>' +
                        '<p class="text-[13px] text-center text-ios-red mb-6" data-i18n="history.delete_confirm_body">' + __('history.delete_confirm_body') + '</p>' +
                        '<button id="delete-confirm-cancel" class="ios-btn-primary mb-2">' + __('history.delete_confirm_cancel') + '</button>' +
                        '<button id="delete-confirm-ok" class="ios-btn-danger">' + __('history.delete_confirm_ok') + '</button>' +
                    '</div>' +
                '</div>'
            );
            $overlay = $('#delete-confirm-overlay');

            // Cancel button
            $overlay.on('click', '#delete-confirm-cancel', function() {
                $overlay.remove();
            });

            // Click outside
            $overlay.on('click', function(e) {
                if (e.target === this) {
                    $(this).remove();
                }
            });

            // Confirm button
            $overlay.on('click', '#delete-confirm-ok', function() {
                $overlay.remove();
                executeDelete();
            });
        }
    }

    function executeDelete() {
        var $btn = $('#history-delete-btn');
        var $status = $('#edit-status-message');
        $btn.prop('disabled', true);
        $btn.find('[data-i18n="history.delete_btn"]').text(__('transaction.submit_sending'));
        $status.addClass('hidden');

        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        $.ajax({
            url: url + '/api/v1/transactions/' + currentEditGroupId,
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            timeout: 15000,
            success: function() {
                $status.removeClass('hidden error').addClass('success')
                    .html('🗑️ ' + __('history.delete_success'));
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
                $status.removeClass('hidden success').addClass('error')
                    .html('❌ ' + msg);
                $btn.prop('disabled', false);
                $btn.find('[data-i18n="history.delete_btn"]').text(__('history.delete_btn'));
            }
        });
    }

    /* ─── Duplicate handler ─── */

    function duplicateTransaction() {
        isDuplicating = true;

        // Hide action buttons
        $('#history-delete-btn').addClass('hidden');
        $('#history-duplicate-btn').addClass('hidden');

        // Update date/time to current
        var now = new Date();
        var datePart = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
        var timePart = String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');
        $('#edit-date').val(datePart);
        $('#edit-time').val(timePart);

        // Change save button label
        $('#history-save-btn').html('<span data-i18n="history.duplicate_btn">' + __('history.duplicate_btn') + '</span>');

        // Show hint
        $('#edit-status-message')
            .removeClass('hidden error').addClass('success')
            .html('📋 ' + __('history.duplicating_hint'));

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();
    }

    /* ─── Go back to list ─── */

    function goBackToList(refresh) {
        var origin = window.FFPWA._editOrigin || 'history';
        window.FFPWA._editOrigin = null;

        if (origin === 'accounts') {
            // Volver al detalle de cuenta específico
            $('#history-detail').addClass('hidden');
            $('#history-container').hide();
            $('#accounts-container').show().removeClass('hidden');
            $('#accounts-list').addClass('hidden');
            $('#account-detail').removeClass('hidden');
            $('#tab-bar .tab-btn').removeClass('active');
            $('#tab-bar .tab-btn[data-screen="accounts"]').addClass('active');
            if (refresh && window.FFPWA.refreshCurrentAccount) {
                window.FFPWA.refreshCurrentAccount();
            }
        } else {
            // Volver al listado del historial
            $('#history-filters').removeClass('hidden');
            $('#history-detail').addClass('hidden');
            $('#history-list-view').removeClass('hidden');
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

        // Limpiar handlers previos en document (mousedown/click delegados) y en inputs (directos)
        $(document).off('.editTx');
        $('#edit-source-account, #edit-dest-account, #edit-category').off('.editTx');

        function getTransactionType() {
            return currentEditTxData ? currentEditTxData.type : 'withdrawal';
        }

        function doAccountFilter(input, dropdown, fieldContext) {
            var query = $(input).val().trim().toLowerCase();
            if (query.length < 1) {
                dropdown.addClass('hidden').removeClass('visible');
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
                dropdown.addClass('hidden').removeClass('visible');
                return;
            }

            var html = '';
            matches.forEach(function(a) {
                html += '<li class="autocomplete-item" data-account-id="' + window.FFPWA.escapeHtml(String(a.id)) + '" ' +
                    'data-account-name="' + window.FFPWA.escapeHtml(a.name) + '">' +
                    '<span>' + window.FFPWA.escapeHtml(a.name) + '</span>' +
                '</li>';
            });
            dropdown.html(html);

            var rect = input.getBoundingClientRect();
            dropdown.css({
                top: (rect.bottom + 4) + 'px',
                left: rect.left + 'px',
                width: rect.width + 'px'
            });
            dropdown.removeClass('hidden').addClass('visible');
        }

        function doCategoryFilter(input, dropdown) {
            var query = $(input).val().trim().toLowerCase();
            if (query.length < 1 || editCategories.length === 0) {
                dropdown.addClass('hidden').removeClass('visible');
                return;
            }

            var matches = editCategories.filter(function(c) {
                return c.name.toLowerCase().includes(query);
            });

            if (matches.length === 0) {
                dropdown.addClass('hidden').removeClass('visible');
                return;
            }

            var html = '';
            matches.forEach(function(c) {
                html += '<li class="autocomplete-item" data-category-id="' + window.FFPWA.escapeHtml(String(c.id)) + '" ' +
                    'data-category-name="' + window.FFPWA.escapeHtml(c.name) + '">' +
                    '<span>' + window.FFPWA.escapeHtml(c.name) + '</span>' +
                '</li>';
            });
            dropdown.html(html);

            var rect = input.getBoundingClientRect();
            dropdown.css({
                top: (rect.bottom + 4) + 'px',
                left: rect.left + 'px',
                width: rect.width + 'px'
            });
            dropdown.removeClass('hidden').addClass('visible');
        }

        // Vincular directamente a los inputs (ya existen)
        $('#edit-source-account').on('keyup.editTx change.editTx', function() {
            doAccountFilter(this, $('#edit-source-autocomplete'), 'source');
        });
        $('#edit-dest-account').on('keyup.editTx change.editTx', function() {
            doAccountFilter(this, $('#edit-dest-autocomplete'), 'destination');
        });
        $('#edit-category').on('keyup.editTx change.editTx', function() {
            doCategoryFilter(this, $('#edit-category-autocomplete'));
        });

        // Mousedown delegado para ítems generados dinámicamente
        $(document).on('mousedown.editTx', '#edit-source-autocomplete .autocomplete-item', function(e) {
            e.preventDefault();
            $('#edit-source-account').val($(this).data('account-name'));
            $('#edit-source-account-id').val($(this).data('account-id'));
            $('#edit-source-account-name').val($(this).data('account-name'));
            $('#edit-source-autocomplete').addClass('hidden').removeClass('visible');
        });

        $(document).on('mousedown.editTx', '#edit-dest-autocomplete .autocomplete-item', function(e) {
            e.preventDefault();
            $('#edit-dest-account').val($(this).data('account-name'));
            $('#edit-dest-account-id').val($(this).data('account-id'));
            $('#edit-dest-account-name').val($(this).data('account-name'));
            $('#edit-dest-autocomplete').addClass('hidden').removeClass('visible');
        });

        $(document).on('mousedown.editTx', '#edit-category-autocomplete .autocomplete-item', function(e) {
            e.preventDefault();
            $('#edit-category').val($(this).data('category-name'));
            $('#edit-category-autocomplete').addClass('hidden').removeClass('visible');
        });

        // Cerrar dropdowns al hacer clic fuera
        $(document).on('click.editTx', function(e) {
            if (!$(e.target).closest('#edit-source-autocomplete, #edit-source-account').length) {
                $('#edit-source-autocomplete').addClass('hidden').removeClass('visible');
            }
            if (!$(e.target).closest('#edit-dest-autocomplete, #edit-dest-account').length) {
                $('#edit-dest-autocomplete').addClass('hidden').removeClass('visible');
            }
            if (!$(e.target).closest('#edit-category-autocomplete, #edit-category').length) {
                $('#edit-category-autocomplete').addClass('hidden').removeClass('visible');
            }
        });
    }

    /* ─── Event wiring ─── */

    $(document).ready(function() {
        $(document).on('click', '#history-detail-back', function() {
            goBackToList(false);
        });

        $(document).on('submit', '#history-edit-form', function(e) {
            saveTransaction(e);
        });

        $(document).on('click', '#history-delete-btn', function() {
            deleteTransaction();
        });

        $(document).on('click', '#history-duplicate-btn', function() {
            duplicateTransaction();
        });
    });

    $(window).on('localeChanged', function() {
        if ($('#history-detail').is(':visible') && window.i18nTranslateDOM) {
            window.i18nTranslateDOM();
        }
    });

})();
