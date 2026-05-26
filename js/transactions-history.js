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

    /* ─── Fetching ─── */

    function fetchTransactions(page) {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;
        var limit = 50;

        if (!url || !token) {
            return Promise.reject(new Error(__('accounts.error_not_configured')));
        }

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: url + '/api/v1/transactions?limit=' + limit + '&page=' + page,
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
                $('#history-list').html(
                    '<div class="ios-status warning">' + __('detail.no_transactions') + '</div>'
                );
            }
            $('#history-load-more').addClass('hidden');
            return;
        }

        var today = new Date().toISOString().split('T')[0];
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

                var displayDate = formatDate(txDateISO);

                // Determinar color y signo según tipo
                var isNegative = (type === 'withdrawal');
                var sign = isNegative ? '-' : '+';
                var colorClass = isNegative ? 'text-ios-red' : 'text-ios-green';
                if (type === 'transfer') {
                    colorClass = 'text-ios-orange';
                    sign = '';
                }

                // Mostrar contraparte según tipo
                var sourceDestStr = escapeHtml(sourceName) + ' → ' + escapeHtml(destName);

                // Indicador de reconciliada
                var reconciledBadge = tx.reconciled ?
                    '<span class="text-[10px] text-ios-green font-medium ml-1">✓ ' + __('history.reconciled') + '</span>' :
                    '';

                html += '<div class="field-card mb-2 history-tx-card" ' +
                    'data-group-id="' + group.id + '" data-tx-idx="' + txIdx + '" ' +
                    'data-group-title="' + escapeHtml(groupTitle || '') + '" ' +
                    'data-reconciled="' + (tx.reconciled ? 'true' : 'false') + '" ' +
                    'style="cursor:pointer;">' +
                    '<div class="field-row" style="justify-content:space-between;padding:10px 14px;">' +
                        '<div style="flex:1;min-width:0;">' +
                            '<p class="text-[11px] text-ios-text-secondary">' +
                                escapeHtml(displayDate) + reconciledBadge +
                            '</p>' +
                            (groupTitle ? '<p class="text-[11px] font-medium text-ios-blue truncate">📦 ' + escapeHtml(groupTitle) + '</p>' : '') +
                            '<p class="text-[14px] font-medium text-ios-text truncate">' + escapeHtml(description) + '</p>' +
                            '<p class="text-[12px] text-ios-text-secondary truncate">' + sourceDestStr + '</p>' +
                            (categoryName ? '<p class="text-[11px] text-ios-blue mt-0.5">📂 ' + escapeHtml(categoryName) + '</p>' : '') +
                        '</div>' +
                        '<div class="text-right ml-3 flex-shrink-0">' +
                            '<p class="text-[15px] font-semibold ' + colorClass + '">' +
                                sign + ' ' + formatMoney(Math.abs(amount), symbol, decimals) +
                            '</p>' +
                            '<p class="text-[10px] text-ios-text-secondary mt-0.5">' + escapeHtml(code) + '</p>' +
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

        $('#history-load-more').addClass('hidden');
        $('#history-loading').removeClass('hidden');

        fetchTransactions(nextPage).then(function(result) {
            renderTransactions(result);
        }).catch(function(err) {
            $('#history-loading').addClass('hidden');
            $('#history-error').removeClass('hidden').text('❌ ' + err.message);
            isLoading = false;
        });
    }

    /* ─── Public entry point ─── */

    window.FFPWA.showHistoryScreen = function() {
        currentPage = 1;
        totalPages = 1;
        isLoading = false;

        $('#history-list').empty();
        $('#history-error').addClass('hidden');
        $('#history-load-more').addClass('hidden');
        $('#history-loading').removeClass('hidden');

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();

        fetchTransactions(1).then(function(result) {
            renderTransactions(result);
        }).catch(function(err) {
            $('#history-loading').addClass('hidden');
            $('#history-error').removeClass('hidden').text('❌ ' + err.message);
        });
    };

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

    /* ─── Event wiring ─── */

    $(document).ready(function() {
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
