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

    /* ─── Public entry point ─── */

    window.FFPWA.showTransactionEdit = function(groupId, txIdx, groupTitle, reconciled) {
        if (groupTitle) {
            window.FFPWA.showStatusMessage(__('history.edit_no_group'), 'warning');
            return;
        }

        fetchTransactionGroup(groupId).then(function(groupData) {
            var tx = groupData.transactions && groupData.transactions[txIdx];
            if (!tx) {
                window.FFPWA.showStatusMessage(__('history.edit_no_data'), 'error');
                return;
            }

            currentEditGroupId = groupId;
            currentEditTxData = tx;

            if (reconciled) {
                showReadOnlyDetail(groupData, tx, txIdx);
            } else {
                showDetailView(groupData, tx, txIdx);
            }
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

    function showReadOnlyDetail(groupData, tx, txIdx) {
        $('#history-list-view').addClass('hidden');
        $('#history-detail').removeClass('hidden');

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

        var summaryHtml =
            '<div class="flex items-center justify-between" style="margin-bottom:12px;">' +
                '<span class="text-[12px] font-semibold uppercase tracking-wide text-ios-text-secondary flex items-center" style="gap:6px;">' +
                    typeIconHtml + '<span>' + escapeHtml(typeLabel) + '</span>' +
                '</span>' +
                '<span class="text-[12px] text-ios-orange font-medium flex items-center" style="gap:4px;">' +
                    Icons.checkCheck + ' <span data-i18n="history.readonly">Conciliado</span>' +
                '</span>' +
            '</div>' +
            '<div style="height:1px;background:var(--ios-separator);margin:0 0 14px 0;"></div>' +
            '<p class="text-[17px] font-semibold text-ios-text">' + escapeHtml(description) + '</p>' +
            '<p class="text-[28px] font-bold ' + colorClass + '">' +
                sign + ' ' + formatMoney(Math.abs(amount), symbol, decimals) +
            '</p>' +
            '<p class="text-[13px] text-ios-text-secondary">' +
                escapeHtml(formatDate(dateStr)) + ' · ' + escapeHtml(sourceName) + ' → ' + escapeHtml(destName) +
            '</p>';

        $('#history-detail-summary').html(summaryHtml);

        populateFormReadOnly(tx);
        if (window.i18nTranslateDOM) window.i18nTranslateDOM();
    }

    function showDetailView(groupData, tx, txIdx) {
        $('#history-list-view').addClass('hidden');
        $('#history-detail').removeClass('hidden');

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

        var summaryHtml =
            '<div class="flex items-center justify-between" style="margin-bottom:12px;">' +
                '<span class="text-[12px] font-semibold uppercase tracking-wide text-ios-text-secondary flex items-center" style="gap:6px;">' +
                    typeIconHtml + '<span>' + escapeHtml(typeLabel) + '</span>' +
                '</span>' +
                '<span class="text-[12px] text-ios-green font-medium flex items-center" style="gap:4px;">' +
                    Icons.pencil + ' <span data-i18n="history.editable">Editable</span>' +
                '</span>' +
            '</div>' +
            '<div style="height:1px;background:var(--ios-separator);margin:0 0 14px 0;"></div>' +
            '<p class="text-[17px] font-semibold text-ios-text">' + escapeHtml(description) + '</p>' +
            '<p class="text-[28px] font-bold ' + colorClass + '">' +
                sign + ' ' + formatMoney(Math.abs(amount), symbol, decimals) +
            '</p>' +
            '<p class="text-[13px] text-ios-text-secondary">' +
                escapeHtml(formatDate(dateStr)) + ' · ' + escapeHtml(sourceName) + ' → ' + escapeHtml(destName) +
            '</p>';

        $('#history-detail-summary').html(summaryHtml);

        // Fetch budgets and categories for the form
        Promise.all([fetchBudgets(), fetchCategories()]).then(function(results) {
            editBudgets = results[0] || [];
            editCategories = results[1] || [];
            populateBudgetDropdown();
            populateForm(tx);
            setupEditAutocomplete();
        }).catch(function() {
            // If fetch fails, still show form with empty dropdowns
            editBudgets = [];
            editCategories = [];
            populateForm(tx);
            setupEditAutocomplete();
        });

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();
    }

    /* ─── Budget dropdown ─── */

    function populateBudgetDropdown() {
        var $select = $('#edit-budget');
        $select.empty().append('<option value="">—</option>');
        editBudgets.forEach(function(b) {
            $select.append('<option value="' + escapeHtml(String(b.id)) + '">' + escapeHtml(b.name) + '</option>');
        });
    }

    /* ─── Populate form (read-only) ─── */

    function populateFormReadOnly(tx) {
        var dateStr = tx.date || '';
        var datePart = dateStr.split('T')[0] || '';
        var timePart = '';
        if (dateStr.indexOf('T') !== -1) {
            var timeMatch = dateStr.split('T')[1];
            if (timeMatch) timePart = timeMatch.substring(0, 5);
        }

        var amount = parseFloat(tx.amount) || 0;
        var foreignAmt = parseFloat(tx.foreign_amount);

        // Ensure budget dropdown has some data (may be empty in readonly if fetch didn't run)
        if ($('#edit-budget option').length <= 1 && tx.budget_name) {
            $('#edit-budget').empty()
                .append('<option value="">—</option>')
                .append('<option value="' + escapeHtml(String(tx.budget_id || '')) + '" selected>' + escapeHtml(tx.budget_name) + '</option>');
        }

        $('#history-edit-form .ios-input, #history-edit-form .ios-select').prop('disabled', true).css('opacity', '0.7');
        $('#edit-description').val(tx.description || '');
        $('#edit-source-account').val(tx.source_name || '');
        $('#edit-source-account-id').val(tx.source_id || '');
        $('#edit-dest-account').val(tx.destination_name || '');
        $('#edit-dest-account-id').val(tx.destination_id || '');
        $('#edit-date').val(datePart);
        $('#edit-time').val(timePart);
        $('#edit-amount').val(Math.abs(amount));
        $('#edit-currency-code').text(tx.currency_code || '');
        $('#edit-foreign-amount').val(!isNaN(foreignAmt) && foreignAmt !== 0 ? Math.abs(foreignAmt) : '').prop('disabled', true);
        $('#edit-foreign-currency').val(tx.foreign_currency_code || '').prop('disabled', true);
        $('#edit-budget').val(tx.budget_id || '');
        $('#edit-category').val(tx.category_name || '');

        if (tx.foreign_amount || tx.foreign_currency_code) {
            $('#edit-foreign-row').removeClass('hidden');
        } else {
            $('#edit-foreign-row').addClass('hidden');
        }

        $('#history-save-btn').addClass('hidden');
        $('#edit-status-message').addClass('hidden');
        $('#history-edit-form .ios-input').css('opacity', '0.7');
    }

    /* ─── Populate form (edit mode) ─── */

    function populateForm(tx) {
        var dateStr = tx.date || '';
        var datePart = dateStr.split('T')[0] || '';
        var timePart = '';
        if (dateStr.indexOf('T') !== -1) {
            var timeMatch = dateStr.split('T')[1];
            if (timeMatch) timePart = timeMatch.substring(0, 5);
        }

        // Enable all inputs
        $('#history-edit-form .ios-input, #history-edit-form .ios-select').prop('disabled', false).css('opacity', '1');

        $('#edit-description').val(tx.description || '');
        $('#edit-source-account').val(tx.source_name || '');
        $('#edit-source-account-id').val(tx.source_id || '');
        $('#edit-source-account-name').val(tx.source_name || '');
        $('#edit-dest-account').val(tx.destination_name || '');
        $('#edit-dest-account-id').val(tx.destination_id || '');
        $('#edit-dest-account-name').val(tx.destination_name || '');
        $('#edit-date').val(datePart);
        $('#edit-time').val(timePart);

        var amount = parseFloat(tx.amount) || 0;
        $('#edit-amount').val(Math.abs(amount));
        $('#edit-currency-code').text(tx.currency_code || '');

        var foreignAmount = parseFloat(tx.foreign_amount);
        if (!isNaN(foreignAmount) && foreignAmount !== 0) {
            $('#edit-foreign-amount').val(Math.abs(foreignAmount));
        } else {
            $('#edit-foreign-amount').val('');
        }
        $('#edit-foreign-currency').val(tx.foreign_currency_code || '');

        // Budget dropdown: select current value
        if (tx.budget_id) {
            $('#edit-budget').val(tx.budget_id);
        } else {
            $('#edit-budget').val('');
        }

        // Category (autocomplete input, populated with name)
        $('#edit-category').val(tx.category_name || '');

        if (tx.foreign_amount || tx.foreign_currency_code) {
            $('#edit-foreign-row').removeClass('hidden');
        } else {
            $('#edit-foreign-row').addClass('hidden');
        }

        $('#history-save-btn').removeClass('hidden');
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
        if (!tx || !currentEditGroupId) return;

        var payload = buildUpdatePayload(tx);

        var $btn = $('#history-save-btn');
        var $status = $('#edit-status-message');
        $btn.prop('disabled', true).text(__('transaction.submit_sending'));
        $status.addClass('hidden');

        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        $.ajax({
            url: url + '/api/v1/transactions/' + currentEditGroupId,
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload),
            dataType: 'json',
            timeout: 30000,
            success: function() {
                $status.removeClass('hidden error').addClass('success')
                    .html('✅ ' + __('history.edit_saved'));
                $btn.prop('disabled', false).html(__('history.saved_btn'));
                currentEditTxData = null;
                currentEditGroupId = null;

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

    /* ─── Go back to list ─── */

    function goBackToList(refresh) {
        var origin = window.FFPWA._editOrigin || 'history';
        window.FFPWA._editOrigin = null;

        if (origin === 'accounts') {
            // Volver al detalle de cuenta específico
            $('#history-detail').addClass('hidden');
            $('#history-list-view').removeClass('hidden');
            $('#history-container').addClass('hidden');
            $('#accounts-container').removeClass('hidden');
            $('#accounts-list').addClass('hidden');
            $('#account-detail').removeClass('hidden');
            $('#tab-bar .tab-btn').removeClass('active');
            $('#tab-bar .tab-btn[data-screen="accounts"]').addClass('active');
        } else {
            // Volver al listado del historial
            $('#history-detail').addClass('hidden');
            $('#history-list-view').removeClass('hidden');
            if (refresh && window.FFPWA.showHistoryScreen) {
                window.FFPWA.showHistoryScreen();
            }
        }
    }

    /* ─── Helpers ─── */

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        var locale = window.getLocale ? window.getLocale() : 'es';
        try {
            return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        } catch(e) {
            return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
        }
    }

    function formatMoney(amount, symbol, decimals) {
        if (amount === undefined || amount === null) amount = 0;
        var formatted = Number(amount).toFixed(decimals);
        var parts = formatted.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return symbol + ' ' + parts.join('.');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ─── Autocomplete for edit form (accounts + categories) ─── */

    function isLiabilityType(accountType) {
        return accountType === 'liability' || accountType === 'liabilities';
    }

    function getAccountTypeFilter(transactionType, fieldContext) {
        if (transactionType === 'deposit') {
            return fieldContext === 'source' ? ['revenue'] : ['asset', 'liability', 'liabilities'];
        }
        if (transactionType === 'transfer') {
            return ['asset', 'liability', 'liabilities'];
        }
        // withdrawal
        return fieldContext === 'source' ? ['asset', 'liability', 'liabilities'] : ['expense'];
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
                html += '<li class="autocomplete-item" data-account-id="' + escapeHtml(String(a.id)) + '" ' +
                    'data-account-name="' + escapeHtml(a.name) + '">' +
                    '<span>' + escapeHtml(a.name) + '</span>' +
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

            // Re-posicionar después de que el teclado termine de abrirse (móvil)
            var $inp = $(input);
            var $dd = dropdown;
            setTimeout(function() {
                if ($dd.hasClass('visible') && $inp.is(':focus')) {
                    var r2 = input.getBoundingClientRect();
                    $dd.css({
                        top: (r2.bottom + 4) + 'px',
                        left: r2.left + 'px',
                        width: r2.width + 'px'
                    });
                }
            }, 300);
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
                html += '<li class="autocomplete-item" data-category-id="' + escapeHtml(String(c.id)) + '" ' +
                    'data-category-name="' + escapeHtml(c.name) + '">' +
                    '<span>' + escapeHtml(c.name) + '</span>' +
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
    });

    $(window).on('localeChanged', function() {
        if ($('#history-detail').is(':visible') && window.i18nTranslateDOM) {
            window.i18nTranslateDOM();
        }
    });

})();
