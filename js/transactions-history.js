/**
 * transactions-history.js — All transactions history tab
 */
(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    /* ─── State ─── */

    var currentPage = 1;
    var totalPages = 1;
    var isLoading = false;
    var requestId = 0;

    // Filter state — persists across tab switches
    window.FFPWA.historyFilters = window.FFPWA.historyFilters || {
        type: '',        // '' = all, withdrawal, deposit, transfer
        accountId: '',   // '' = all, or expense account ID
        accountName: '', // Display name for the selected account
        search: ''       // Free-text search
    };

    var searchTimer = null;
    var accountDropdownTimer = null;

    /* ─── Query builder ─── */

    function buildSearchQuery() {
        var f = window.FFPWA.historyFilters;
        var parts = [];

        if (f.type) {
            parts.push('type:' + f.type);
        }
        if (f.accountId) {
            parts.push('account_id:' + f.accountId);
        }
        if (f.search) {
            var text = f.search.trim();
            if (text.includes(' ')) {
                parts.push('"' + text + '"');
            } else {
                parts.push(text);
            }
        }

        return parts.join(' ');
    }

    /* ─── Fetching ─── */

    function fetchTransactions(page) {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;
        var limit = 50;

        if (!url || !token) {
            return Promise.reject(new Error(__('accounts.error_not_configured')));
        }

        var query = buildSearchQuery();
        var params = 'limit=' + limit + '&page=' + page;

        // Use search endpoint only when filters are active, fallback to transactions otherwise
        var endpoint = query ? '/api/v1/search/transactions' : '/api/v1/transactions';
        if (query) {
            params += '&query=' + encodeURIComponent(query);
        }

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: url + endpoint + '?' + params,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 30000,
                success: function(response) {
                    resolve({
                        transactions: response.data || [],
                        pagination: response.meta ? response.meta.pagination : { total: 0, count: 0, per_page: limit, current_page: 1, total_pages: 1 }
                    });
                },
                error: function(xhr) {
                    var msg = __('history.error_fetch');
                    if (xhr.status === 401) msg += ' ' + __('setup.token_401');
                    else if (xhr.status === 0) msg += ' ' + __('setup.no_connection');
                    else msg += ' (HTTP ' + xhr.status + ')';
                    reject(new Error(msg));
                }
            });
        });
    }

    /* ─── Rendering ─── */

    function renderTransactions(result) {
        $('#history-loading').addClass('hidden');

        var data = result.transactions;
        var pagination = result.pagination;
        currentPage = pagination.current_page || 1;
        totalPages = pagination.total_pages || 1;

        if (!data || data.length === 0) {
            if (currentPage === 1) {
                var hasFilters = window.FFPWA.historyFilters.type ||
                                 window.FFPWA.historyFilters.accountId ||
                                 window.FFPWA.historyFilters.search;
                var msg = hasFilters ? __('history.filter_no_results') : __('detail.no_transactions');
                $('#history-list').html(
                    '<div class="ios-status warning">' + msg + '</div>'
                );
            }
            $('#history-load-more').addClass('hidden');
            return;
        }

        var now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        var html = '';

        data.forEach(function(group) {
            var attrs = group.attributes || {};
            var groupTitle = attrs.group_title || '';
            var subTxns = attrs.transactions || [];

            // Mostrar todas las sub-transacciones del grupo
            subTxns.forEach(function(tx, txIdx) {
                var txDateISO = tx.date || '';
                var txDatePart = txDateISO.split('T')[0];

                // Saltar transacciones futuras
                if (txDatePart > today) return;

                var type = tx.type || 'withdrawal';
                var description = tx.description || __('detail.no_description');
                var amount = parseFloat(tx.amount) || 0;
                var code = tx.currency_code || '';
                var symbol = tx.currency_symbol || '$';
                var decimals = tx.currency_decimal_places || 2;
                var sourceName = tx.source_name || '';
                var destName = tx.destination_name || '';
                var categoryName = tx.category_name || '';
                var budgetName = tx.budget_name || '';
                var tags = tx.tags || [];

                var displayDate = window.FFPWA.formatDate(txDateISO);

                // Determinar color y signo según tipo
                var isNegative = (type === 'withdrawal');
                var sign = isNegative ? '-' : '+';
                var colorClass = isNegative ? 'text-ios-red' : 'text-ios-green';
                if (type === 'transfer') {
                    colorClass = 'text-ios-orange';
                    sign = '';
                }

                // Mostrar contraparte según tipo
                var sourceDestStr = window.FFPWA.escapeHtml(sourceName) + ' → ' + window.FFPWA.escapeHtml(destName);

                // Indicador de reconciliada
                var reconciledBadge = tx.reconciled ?
                    '<span class="text-[10px] text-ios-green font-medium ml-1">✓ ' + __('history.reconciled') + '</span>' :
                    '';

                html += '<div class="field-card mb-2 history-tx-card" ' +
                    'data-group-id="' + group.id + '" data-tx-idx="' + txIdx + '" ' +
                    'data-group-title="' + window.FFPWA.escapeHtml(groupTitle || '') + '" ' +
                    'data-reconciled="' + (tx.reconciled ? 'true' : 'false') + '" ' +
                    'style="cursor:pointer;">' +
                    '<div class="field-row" style="justify-content:space-between;padding:10px 14px;">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<p class="text-[11px] text-ios-text-secondary">' +
                                window.FFPWA.escapeHtml(displayDate) + reconciledBadge +
                            '</p>' +
                            (groupTitle ? '<p class="text-[11px] font-medium text-ios-blue truncate">📦 ' + window.FFPWA.escapeHtml(groupTitle) + '</p>' : '') +
                            '<p class="text-[14px] font-medium text-ios-text truncate">' + window.FFPWA.escapeHtml(description) + '</p>' +
                            '<p class="text-[12px] text-ios-text-secondary truncate">' + sourceDestStr + '</p>' +
                            (categoryName ? '<p class="text-[11px] text-ios-blue mt-0.5">📂 ' + window.FFPWA.escapeHtml(categoryName) + '</p>' : '') +
                        '</div>' +
                        '<div class="text-right ml-3 flex-shrink-0">' +
                            '<p class="text-[15px] font-semibold ' + colorClass + '">' +
                                sign + ' ' + window.FFPWA.formatMoney(Math.abs(amount), symbol, decimals) +
                            '</p>' +
                            '<p class="text-[10px] text-ios-text-secondary mt-0.5">' + window.FFPWA.escapeHtml(code) + '</p>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
        });

        $('#history-list').append(html);

        // Mostrar/ocultar botón de más páginas
        if (currentPage < totalPages) {
            $('#history-load-more').removeClass('hidden');
        } else {
            $('#history-load-more').addClass('hidden');
        }

        isLoading = false;
    }

    /* ─── Load more ─── */

    function loadMore() {
        if (isLoading) return;
        if (currentPage >= totalPages) return;

        isLoading = true;
        var nextPage = currentPage + 1;
        requestId++;
        var thisRequest = requestId;

        $('#history-load-more').addClass('hidden');
        $('#history-loading').removeClass('hidden');

        fetchTransactions(nextPage).then(function(result) {
            if (requestId !== thisRequest) return;
            renderTransactions(result);
        }).catch(function(err) {
            if (requestId !== thisRequest) return;
            $('#history-loading').addClass('hidden');
            $('#history-error').removeClass('hidden').text('❌ ' + err.message);
            isLoading = false;
        });
    }

    /* ─── Filter logic ─── */

    function applyFilters() {
        currentPage = 1;
        totalPages = 1;
        isLoading = false;
        requestId++;
        var thisRequest = requestId;

        $('#history-list').empty();
        $('#history-error').addClass('hidden');
        $('#history-load-more').addClass('hidden');
        $('#history-loading').removeClass('hidden');

        updateClearButton();

        fetchTransactions(1).then(function(result) {
            if (requestId !== thisRequest) return;
            renderTransactions(result);
        }).catch(function(err) {
            if (requestId !== thisRequest) return;
            $('#history-loading').addClass('hidden');
            $('#history-error').removeClass('hidden').text('❌ ' + err.message);
        });
    }

    function clearFilters() {
        var f = window.FFPWA.historyFilters;
        f.type = '';
        f.accountId = '';
        f.accountName = '';
        f.search = '';

        // Reset UI
        $('#history-type-filter .segmented-btn').removeClass('active');
        $('#history-type-filter .segmented-btn[data-type=""]').addClass('active').attr('aria-checked', 'true');
        $('#history-type-filter .segmented-btn[data-type!=""]').attr('aria-checked', 'false');
        $('#history-account-filter').val('').attr('placeholder', __('history.filter_account_placeholder'));
        $('#history-search').val('');
        $('#history-clear-wrap').addClass('hidden');

        applyFilters();
    }

    function updateClearButton() {
        var f = window.FFPWA.historyFilters;
        if (f.type || f.accountId || f.search) {
            $('#history-clear-wrap').removeClass('hidden');
        } else {
            $('#history-clear-wrap').addClass('hidden');
        }
    }

    /* ─── Account filter autocomplete ─── */

    function getExpenseAccounts() {
        var cache = window.FFPWA.accountsCache;
        if (!cache || !cache.length) return [];
        return cache.filter(function(a) {
            return a.type === 'expense' && a.active !== false;
        }).map(function(a) {
            return { id: a.id, name: a.name };
        });
    }

    function filterAccountDropdown(query) {
        var $dropdown = $('#history-account-dropdown');
        var accounts = getExpenseAccounts();
        var q = query.toLowerCase();

        if (q.length === 0) {
            // Show all
            renderAccountDropdown($dropdown, accounts);
        } else {
            var filtered = accounts.filter(function(a) {
                return a.name.toLowerCase().indexOf(q) !== -1;
            });
            renderAccountDropdown($dropdown, filtered);
        }
    }

    function renderAccountDropdown($dropdown, accounts) {
        $dropdown.empty();
        if (accounts.length === 0) {
            $dropdown.addClass('hidden').removeClass('visible');
            return;
        }

        var html = '';
        accounts.forEach(function(a) {
            html += '<li class="autocomplete-item" data-account-id="' + a.id + '" data-account-name="' + window.FFPWA.escapeHtml(a.name) + '">' +
                '<span>' + window.FFPWA.escapeHtml(a.name) + '</span>' +
            '</li>';
        });
        $dropdown.html(html);
    }

    function showAccountDropdown() {
        var $dropdown = $('#history-account-dropdown');
        var $input = $('#history-account-filter');
        var rect = $input[0].getBoundingClientRect();

        $dropdown.css({
            top: (rect.bottom + 4) + 'px',
            left: rect.left + 'px',
            width: rect.width + 'px'
        });

        $dropdown.removeClass('hidden').addClass('visible');
    }

    function hideAccountDropdown() {
        $('#history-account-dropdown').removeClass('visible').addClass('hidden');
    }

    function selectAccountFilter(id, name) {
        var f = window.FFPWA.historyFilters;
        f.accountId = String(id);
        f.accountName = name;
        $('#history-account-filter').val(name);
        hideAccountDropdown();
        applyFilters();
    }

    function clearAccountFilter() {
        var f = window.FFPWA.historyFilters;
        f.accountId = '';
        f.accountName = '';
        $('#history-account-filter').val('').attr('placeholder', __('history.filter_account_placeholder'));
        applyFilters();
    }

    /* ─── Public entry point ─── */

    window.FFPWA.showHistoryScreen = function() {
        currentPage = 1;
        totalPages = 1;
        isLoading = false;

        $('#history-filters').removeClass('hidden');
        $('#history-list-view').removeClass('hidden');
        $('#history-detail').addClass('hidden');

        // Restore filter UI from persistent state
        restoreFilterUI();
        updateClearButton();

        $('#history-list').empty();
        $('#history-error').addClass('hidden');
        $('#history-load-more').addClass('hidden');
        $('#history-loading').removeClass('hidden');

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        if (window.injectIcons) window.injectIcons(document.getElementById('history-filters'));

        fetchTransactions(1).then(function(result) {
            renderTransactions(result);
        }).catch(function(err) {
            $('#history-loading').addClass('hidden');
            $('#history-error').removeClass('hidden').text('❌ ' + err.message);
        });
    };

    function restoreFilterUI() {
        var f = window.FFPWA.historyFilters;

        // Type segmented control
        $('#history-type-filter .segmented-btn').removeClass('active').attr('aria-checked', 'false');
        var $typeBtn = $('#history-type-filter .segmented-btn[data-type="' + f.type + '"]');
        if ($typeBtn.length) {
            $typeBtn.addClass('active').attr('aria-checked', 'true');
        } else {
            $('#history-type-filter .segmented-btn[data-type=""]').addClass('active').attr('aria-checked', 'true');
        }

        // Account filter
        if (f.accountId && f.accountName) {
            $('#history-account-filter').val(f.accountName);
        } else {
            $('#history-account-filter').val('').attr('placeholder', __('history.filter_account_placeholder'));
        }

        // Search input
        $('#history-search').val(f.search);
    }

    /* ─── Event wiring ─── */

    $(document).ready(function() {

        // Type filter — segmented control
        $(document).on('click', '#history-type-filter .segmented-btn', function() {
            var $btn = $(this);
            var newType = $btn.data('type');
            if (newType === window.FFPWA.historyFilters.type) return;

            $('#history-type-filter .segmented-btn').removeClass('active').attr('aria-checked', 'false');
            $btn.addClass('active').attr('aria-checked', 'true');

            window.FFPWA.historyFilters.type = newType;
            applyFilters();
        });

        // Account filter — autocomplete input
        $(document).on('input', '#history-account-filter', function() {
            var val = $(this).val().trim();

            // If user clears the input, clear the filter
            if (val === '' && window.FFPWA.historyFilters.accountId) {
                clearAccountFilter();
                return;
            }

            clearTimeout(accountDropdownTimer);
            accountDropdownTimer = setTimeout(function() {
                filterAccountDropdown(val);
                var accounts = getExpenseAccounts();
                if (accounts.length > 0) {
                    showAccountDropdown();
                }
            }, 150);
        });

        $(document).on('focus', '#history-account-filter', function() {
            var accounts = getExpenseAccounts();
            if (accounts.length > 0) {
                filterAccountDropdown($(this).val().trim());
                showAccountDropdown();
            }
        });

        // Account selection
        $(document).on('mousedown', '#history-account-dropdown .autocomplete-item', function(e) {
            e.preventDefault();
            var id = $(this).data('account-id');
            var name = $(this).data('account-name');
            selectAccountFilter(id, name);
        });

        // Close account dropdown on outside click
        $(document).on('click', function(e) {
            if (!$(e.target).closest('#history-account-filter-wrap').length) {
                hideAccountDropdown();
            }
        });

        // Search — debounced input
        $(document).on('input', '#history-search', function() {
            var val = $(this).val().trim();

            clearTimeout(searchTimer);
            searchTimer = setTimeout(function() {
                if (window.FFPWA.historyFilters.search !== val) {
                    window.FFPWA.historyFilters.search = val;
                    applyFilters();
                } else {
                    updateClearButton();
                }
            }, 600);
        });

        // Clear all filters
        $(document).on('click', '#history-clear-filters', function() {
            clearFilters();
        });

        // Load more
        $(document).on('click', '#history-load-more', function() {
            loadMore();
        });

        $(document).on('click', '.history-tx-card', function() {
            var $card = $(this);
            var groupId = $card.data('group-id');
            var txIdx = $card.data('tx-idx');
            var groupTitle = $card.data('group-title');
            var reconciled = $card.data('reconciled') === true || $card.data('reconciled') === 'true';

            if (window.FFPWA.showTransactionEdit) {
                window.FFPWA.showTransactionEdit(groupId, txIdx, groupTitle, reconciled);
            }
        });
    });

    $(window).on('localeChanged', function() {
        if (!$('#history-container').hasClass('hidden') && window.FFPWA.showHistoryScreen) {
            window.FFPWA.showHistoryScreen();
            if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        }
    });

})();
