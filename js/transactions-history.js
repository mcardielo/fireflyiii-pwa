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
            window.FFPWA.http({
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
        var historyLoading = document.getElementById('history-loading');
        if (historyLoading) historyLoading.classList.add('hidden');

        var data = result.transactions;
        var pagination = result.pagination;
        currentPage = pagination.current_page || 1;
        totalPages = pagination.total_pages || 1;

        var historyList = document.getElementById('history-list');
        var historyLoadMore = document.getElementById('history-load-more');

        if (!data || data.length === 0) {
            if (currentPage === 1 && historyList) {
                var hasFilters = window.FFPWA.historyFilters.type ||
                                 window.FFPWA.historyFilters.accountId ||
                                 window.FFPWA.historyFilters.search;
                var msg = hasFilters ? __('history.filter_no_results') : __('detail.no_transactions');
                historyList.innerHTML =
                    '<div class="ios-status warning">' + msg + '</div>';
            }
            if (historyLoadMore) historyLoadMore.classList.add('hidden');
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

        if (historyList) historyList.insertAdjacentHTML('beforeend', html);

        // Mostrar/ocultar botón de más páginas
        if (currentPage < totalPages) {
            if (historyLoadMore) historyLoadMore.classList.remove('hidden');
        } else {
            if (historyLoadMore) historyLoadMore.classList.add('hidden');
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

        var historyLoadMore = document.getElementById('history-load-more');
        var historyLoading = document.getElementById('history-loading');
        if (historyLoadMore) historyLoadMore.classList.add('hidden');
        if (historyLoading) historyLoading.classList.remove('hidden');

        fetchTransactions(nextPage).then(function(result) {
            if (requestId !== thisRequest) return;
            renderTransactions(result);
        }).catch(function(err) {
            if (requestId !== thisRequest) return;
            var hl = document.getElementById('history-loading');
            var he = document.getElementById('history-error');
            if (hl) hl.classList.add('hidden');
            if (he) { he.classList.remove('hidden'); he.textContent = '❌ ' + err.message; }
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

        var historyList = document.getElementById('history-list');
        var historyError = document.getElementById('history-error');
        var historyLoadMore = document.getElementById('history-load-more');
        var historyLoading = document.getElementById('history-loading');

        if (historyList) historyList.innerHTML = '';
        if (historyError) historyError.classList.add('hidden');
        if (historyLoadMore) historyLoadMore.classList.add('hidden');
        if (historyLoading) historyLoading.classList.remove('hidden');

        updateClearButton();

        fetchTransactions(1).then(function(result) {
            if (requestId !== thisRequest) return;
            renderTransactions(result);
        }).catch(function(err) {
            if (requestId !== thisRequest) return;
            var hl = document.getElementById('history-loading');
            var he = document.getElementById('history-error');
            if (hl) hl.classList.add('hidden');
            if (he) { he.classList.remove('hidden'); he.textContent = '❌ ' + err.message; }
        });
    }

    function clearFilters() {
        var f = window.FFPWA.historyFilters;
        f.type = '';
        f.accountId = '';
        f.accountName = '';
        f.search = '';

        // Reset UI
        document.querySelectorAll('#history-type-filter .segmented-btn').forEach(function(btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-checked', 'false');
        });
        var allBtn = document.querySelector('#history-type-filter .segmented-btn[data-type=""]');
        if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-checked', 'true'); }

        var accountFilter = document.getElementById('history-account-filter');
        if (accountFilter) { accountFilter.value = ''; accountFilter.setAttribute('placeholder', __('history.filter_account_placeholder')); }

        var searchEl = document.getElementById('history-search');
        if (searchEl) searchEl.value = '';

        var clearWrap = document.getElementById('history-clear-wrap');
        if (clearWrap) clearWrap.classList.add('hidden');

        applyFilters();
    }

    function updateClearButton() {
        var f = window.FFPWA.historyFilters;
        var clearWrap = document.getElementById('history-clear-wrap');
        if (!clearWrap) return;
        if (f.type || f.accountId || f.search) {
            clearWrap.classList.remove('hidden');
        } else {
            clearWrap.classList.add('hidden');
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
        var dropdown = document.getElementById('history-account-dropdown');
        if (!dropdown) return;
        var accounts = getExpenseAccounts();
        var q = query.toLowerCase();

        if (q.length === 0) {
            // Show all
            renderAccountDropdown(dropdown, accounts);
        } else {
            var filtered = accounts.filter(function(a) {
                return a.name.toLowerCase().indexOf(q) !== -1;
            });
            renderAccountDropdown(dropdown, filtered);
        }
    }

    function renderAccountDropdown(dropdown, accounts) {
        if (!dropdown) return;
        dropdown.innerHTML = '';
        if (accounts.length === 0) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('visible');
            return;
        }

        var html = '';
        accounts.forEach(function(a) {
            html += '<li class="autocomplete-item" data-account-id="' + a.id + '" data-account-name="' + window.FFPWA.escapeHtml(a.name) + '">' +
                '<span>' + window.FFPWA.escapeHtml(a.name) + '</span>' +
            '</li>';
        });
        dropdown.innerHTML = html;
    }

    function showAccountDropdown() {
        var dropdown = document.getElementById('history-account-dropdown');
        var input = document.getElementById('history-account-filter');
        if (!dropdown || !input) return;
        var rect = input.getBoundingClientRect();

        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';

        dropdown.classList.remove('hidden');
        dropdown.classList.add('visible');
    }

    function hideAccountDropdown() {
        var dropdown = document.getElementById('history-account-dropdown');
        if (!dropdown) return;
        dropdown.classList.remove('visible');
        dropdown.classList.add('hidden');
    }

    function selectAccountFilter(id, name) {
        var f = window.FFPWA.historyFilters;
        f.accountId = String(id);
        f.accountName = name;
        var input = document.getElementById('history-account-filter');
        if (input) input.value = name;
        hideAccountDropdown();
        applyFilters();
    }

    function clearAccountFilter() {
        var f = window.FFPWA.historyFilters;
        f.accountId = '';
        f.accountName = '';
        var input = document.getElementById('history-account-filter');
        if (input) { input.value = ''; input.setAttribute('placeholder', __('history.filter_account_placeholder')); }
        applyFilters();
    }

    /* ─── Public entry point ─── */

    window.FFPWA.showHistoryScreen = function() {
        currentPage = 1;
        totalPages = 1;
        isLoading = false;

        var historyFilters = document.getElementById('history-filters');
        var historyListView = document.getElementById('history-list-view');
        var historyDetail = document.getElementById('history-detail');
        if (historyFilters) historyFilters.classList.remove('hidden');
        if (historyListView) historyListView.classList.remove('hidden');
        if (historyDetail) historyDetail.classList.add('hidden');

        // Restore filter UI from persistent state
        restoreFilterUI();
        updateClearButton();

        var historyList = document.getElementById('history-list');
        var historyError = document.getElementById('history-error');
        var historyLoadMore = document.getElementById('history-load-more');
        var historyLoading = document.getElementById('history-loading');
        if (historyList) historyList.innerHTML = '';
        if (historyError) historyError.classList.add('hidden');
        if (historyLoadMore) historyLoadMore.classList.add('hidden');
        if (historyLoading) historyLoading.classList.remove('hidden');

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        if (window.injectIcons) window.injectIcons(document.getElementById('history-filters'));

        fetchTransactions(1).then(function(result) {
            renderTransactions(result);
        }).catch(function(err) {
            var hl = document.getElementById('history-loading');
            var he = document.getElementById('history-error');
            if (hl) hl.classList.add('hidden');
            if (he) { he.classList.remove('hidden'); he.textContent = '❌ ' + err.message; }
        });
    };

    function restoreFilterUI() {
        var f = window.FFPWA.historyFilters;

        // Type segmented control
        document.querySelectorAll('#history-type-filter .segmented-btn').forEach(function(btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-checked', 'false');
        });
        var typeBtn = document.querySelector('#history-type-filter .segmented-btn[data-type="' + f.type + '"]');
        if (typeBtn) {
            typeBtn.classList.add('active');
            typeBtn.setAttribute('aria-checked', 'true');
        } else {
            var allBtn = document.querySelector('#history-type-filter .segmented-btn[data-type=""]');
            if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-checked', 'true'); }
        }

        // Account filter
        var accountFilter = document.getElementById('history-account-filter');
        if (accountFilter) {
            if (f.accountId && f.accountName) {
                accountFilter.value = f.accountName;
            } else {
                accountFilter.value = '';
                accountFilter.setAttribute('placeholder', __('history.filter_account_placeholder'));
            }
        }

        // Search input
        var searchEl = document.getElementById('history-search');
        if (searchEl) searchEl.value = f.search;
    }

    /* ─── Event wiring ─── */

    function domReady() {

        // Type filter — segmented control
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('#history-type-filter .segmented-btn');
            if (!btn) return;
            var newType = btn.getAttribute('data-type');
            if (newType === window.FFPWA.historyFilters.type) return;

            document.querySelectorAll('#history-type-filter .segmented-btn').forEach(function(b) {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-checked', 'true');

            window.FFPWA.historyFilters.type = newType;
            applyFilters();
        });

        // Account filter — autocomplete input
        document.addEventListener('input', function(e) {
            if (e.target && e.target.id === 'history-account-filter') {
                var val = e.target.value.trim();

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
            }
        });

        document.addEventListener('focus', function(e) {
            if (e.target && e.target.id === 'history-account-filter') {
                var accounts = getExpenseAccounts();
                if (accounts.length > 0) {
                    filterAccountDropdown(e.target.value.trim());
                    showAccountDropdown();
                }
            }
        });

        // Account selection
        document.addEventListener('mousedown', function(e) {
            var item = e.target.closest('#history-account-dropdown .autocomplete-item');
            if (!item) return;
            e.preventDefault();
            var id = item.getAttribute('data-account-id');
            var name = item.getAttribute('data-account-name');
            selectAccountFilter(id, name);
        });

        // Close account dropdown on outside click
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#history-account-filter-wrap')) {
                hideAccountDropdown();
            }
        });

        // Search — debounced input
        document.addEventListener('input', function(e) {
            if (e.target && e.target.id === 'history-search') {
                var val = e.target.value.trim();

                clearTimeout(searchTimer);
                searchTimer = setTimeout(function() {
                    if (window.FFPWA.historyFilters.search !== val) {
                        window.FFPWA.historyFilters.search = val;
                        applyFilters();
                    } else {
                        updateClearButton();
                    }
                }, 600);
            }
        });

        // Clear all filters
        document.addEventListener('click', function(e) {
            if (e.target.closest('#history-clear-filters')) {
                clearFilters();
            }
        });

        // Load more
        document.addEventListener('click', function(e) {
            if (e.target.closest('#history-load-more')) {
                loadMore();
            }
        });

        document.addEventListener('click', function(e) {
            var card = e.target.closest('.history-tx-card');
            if (!card) return;
            var groupId = card.getAttribute('data-group-id');
            var txIdx = card.getAttribute('data-tx-idx');
            var groupTitle = card.getAttribute('data-group-title');
            var reconciled = card.getAttribute('data-reconciled') === 'true';

            if (window.FFPWA.showTransactionEdit) {
                window.FFPWA.showTransactionEdit(groupId, txIdx, groupTitle, reconciled);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', domReady);
    } else {
        domReady();
    }

    window.FFPWA._onLocaleHistory = function() {
        var historyContainer = document.getElementById('history-container');
        if (!historyContainer || historyContainer.classList.contains('hidden')) return;
        if (window.FFPWA.showHistoryScreen) {
            window.FFPWA.showHistoryScreen();
            if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        }
    };

})();