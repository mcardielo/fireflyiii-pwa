/**
 * accounts-screen.js — Accounts list + account transaction history
 */
(function() {
    'use strict';

    window.FFPWA = window.FFPWA || {};

    /* ─── Role config ─── */

    var ROLE_LABELS = {};
    var ROLE_COLORS = {
        'defaultAsset':     'var(--role-default)',
        'savingAsset':      'var(--role-saving)',
        'sharedAsset':      'var(--role-shared)',
        'ccAsset':          'var(--role-cc)',
        'cashWalletAsset':  'var(--role-cash)',
        '':                 'var(--role-other)'
    };
    var ROLE_BG_COLORS = {
        'defaultAsset':     'var(--role-bg-default)',
        'savingAsset':      'var(--role-bg-saving)',
        'sharedAsset':      'var(--role-bg-shared)',
        'ccAsset':          'var(--role-bg-cc)',
        'cashWalletAsset':  'var(--role-bg-cash)',
        '':                 'var(--role-bg-other)'
    };

    function buildRoleLabels() {
        ROLE_LABELS = {
            'defaultAsset':     __('accounts.role_default'),
            'savingAsset':      __('accounts.role_savings'),
            'sharedAsset':      __('accounts.role_shared'),
            'ccAsset':          __('accounts.role_cc'),
            'cashWalletAsset':  __('accounts.role_cash'),
            '':                 __('accounts.role_asset')
        };
    }

    /* ─── Liability labels ─── */

    var LIABILITY_TYPE_LABELS = {};

    function buildLiabilityLabels() {
        LIABILITY_TYPE_LABELS = {
            'loan':   __('accounts.liability_type_loan'),
            'debt':   __('accounts.liability_type_debt'),
            'credit': __('accounts.liability_type_credit')
        };
    }

    /* ─── Account state for detail view ─── */

    var accountsMap = {};
    var currentAccount = null;
    var currentPage = 1;
    var totalPages = 1;

    /* ─── Fetching ─── */

    function fetchAssetAccounts() {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        if (!url || !token) {
            return Promise.reject(new Error(__('accounts.error_not_configured')));
        }

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: url + '/api/v1/accounts?type=asset&limit=10000',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 15000,
                success: function(response) {
                    var accounts = response.data || [];
                    accounts = accounts.filter(function(acc) {
                        return acc.attributes && acc.attributes.active !== false;
                    });
                    resolve(accounts);
                },
                error: function(xhr) {
                    var msg = __('accounts.error_fetch');
                    if (xhr.status === 401) msg += ' ' + __('setup.token_401');
                    else if (xhr.status === 0) msg += ' ' + __('setup.no_connection');
                    else msg += ' (HTTP ' + xhr.status + ')';
                    reject(new Error(msg));
                }
            });
        });
    }

    function fetchLiabilityAccounts() {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        if (!url || !token) {
            return Promise.reject(new Error(__('accounts.error_not_configured')));
        }

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: url + '/api/v1/accounts?type=liabilities&limit=10000',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 15000,
                success: function(response) {
                    var accounts = response.data || [];
                    accounts = accounts.filter(function(acc) {
                        return acc.attributes && acc.attributes.active !== false;
                    });
                    resolve(accounts);
                },
                error: function(xhr) {
                    var msg = __('accounts.error_fetch');
                    if (xhr.status === 401) msg += ' ' + __('setup.token_401');
                    else if (xhr.status === 0) msg += ' ' + __('setup.no_connection');
                    else msg += ' (HTTP ' + xhr.status + ')';
                    reject(new Error(msg));
                }
            });
        });
    }

    function fetchTransactions(accountId, page) {
        var url = window.FFPWA.config.url;
        var token = window.FFPWA.config.token;

        return new Promise(function(resolve, reject) {
            $.ajax({
                url: url + '/api/v1/accounts/' + accountId + '/transactions?limit=50&page=' + page,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                dataType: 'json',
                timeout: 15000,
                success: function(response) {
                    resolve({
                        transactions: response.data || [],
                        meta: response.meta || { pagination: { total: 0, current_page: page, total_pages: 1 } }
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

    /* ─── Accounts list rendering ─── */

    function renderAccounts(accounts) {
        $('#accounts-loading').addClass('hidden');

        if (!accounts || accounts.length === 0) {
            $('#accounts-list').html(
                '<div class="ios-status warning">' + __('accounts.no_accounts') + '</div>'
            );
            return;
        }

        accountsMap = {};
        var html = '';

        accounts.forEach(function(acc) {
            var attrs = acc.attributes || {};
            var id = acc.id;
            accountsMap[id] = acc;
            var name = attrs.name || __('accounts.unnamed');
            var balance = parseFloat(attrs.current_balance) || 0;
            var code = attrs.currency_code || '';
            var symbol = attrs.currency_symbol || '$';
            var role = attrs.account_role || '';
            var roleLabel = ROLE_LABELS[role] || __('accounts.role_asset');
            var decimals = attrs.currency_decimal_places || 2;
            var roleColor = ROLE_COLORS[role] || '#8e8e93';
            var roleBg = ROLE_BG_COLORS[role] || '#f2f2f7';

            html += '<div class="field-card mb-3 account-card" data-account-id="' + id + '">' +
                '<div class="field-row" style="justify-content:space-between;padding:14px 16px;cursor:pointer;">' +
                    '<div>' +
                        '<p class="text-[15px] font-medium text-ios-text">' + window.FFPWA.escapeHtml(name) + '</p>' +
                        '<p class="mt-1">' +
                            '<span class="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full" ' +
                                  'style="color:' + roleColor + ';background:' + roleBg + ';">' +
                                window.FFPWA.escapeHtml(roleLabel) +
                            '</span>' +
                        '</p>' +
                    '</div>' +
                    '<div class="text-right ml-4 flex-shrink-0">' +
                        '<p class="text-[17px] font-semibold ' + (balance < 0 ? 'text-ios-red' : 'text-ios-text') + '">' +
                            window.FFPWA.formatMoney(balance, symbol, decimals) +
                        '</p>' +
                        '<p class="text-[11px] text-ios-text-secondary mt-0.5">' + window.FFPWA.escapeHtml(code) + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        });

        $('#accounts-list').html(html);
    }

    function renderLiabilities(liabilities) {
        if (!liabilities || liabilities.length === 0) return;

        var html = '';

        // Section header
        html += '<div class="mb-2 mt-6 px-1">' +
            '<h3 class="text-[13px] font-semibold uppercase tracking-wide text-ios-text-secondary">' +
            __('accounts.liability_title') +
            '</h3>' +
        '</div>';

        liabilities.forEach(function(acc) {
            var attrs = acc.attributes || {};
            var id = acc.id;
            accountsMap[id] = acc;
            var name = attrs.name || __('accounts.unnamed');
            var balance = parseFloat(attrs.current_balance) || 0;
            var code = attrs.currency_code || '';
            var symbol = attrs.currency_symbol || '$';
            var decimals = attrs.currency_decimal_places || 2;
            var liabilityType = attrs.liability_type || '';
            var typeLabel = LIABILITY_TYPE_LABELS[liabilityType] || __('accounts.role_asset');

            html += '<div class="field-card mb-3 account-card" data-account-id="' + id + '">' +
                '<div class="field-row" style="justify-content:space-between;padding:14px 16px;cursor:pointer;">' +
                    '<div>' +
                        '<p class="text-[15px] font-medium text-ios-text">' + window.FFPWA.escapeHtml(name) + '</p>' +
                        '<p class="mt-1">' +
                            '<span class="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full" ' +
                                  'style="color:var(--ios-text-secondary);background:var(--ios-segmented-bg);">' +
                                window.FFPWA.escapeHtml(typeLabel) +
                            '</span>' +
                        '</p>' +
                    '</div>' +
                    '<div class="text-right ml-4 flex-shrink-0">' +
                        '<p class="text-[17px] font-semibold ' + (balance < 0 ? 'text-ios-red' : 'text-ios-text') + '">' +
                            window.FFPWA.formatMoney(balance, symbol, decimals) +
                        '</p>' +
                        '<p class="text-[11px] text-ios-text-secondary mt-0.5">' + window.FFPWA.escapeHtml(code) + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        });

        $('#accounts-list').append(html);
    }

    /* ─── Transaction detail ─── */

    function showAccountDetail(accountId, accountData) {
        currentAccount = accountData;
        currentPage = 1;
        totalPages = 1;

        var attrs = accountData.attributes || {};
        var name = attrs.name || __('accounts.unnamed');
        var balance = parseFloat(attrs.current_balance) || 0;
        var symbol = attrs.currency_symbol || '$';
        var code = attrs.currency_code || '';
        var decimals = attrs.currency_decimal_places || 2;
        var role = attrs.account_role || '';
        var roleLabel = ROLE_LABELS[role] || __('accounts.role_asset');
        var roleColor = ROLE_COLORS[role] || '#8e8e93';
        var roleBg = ROLE_BG_COLORS[role] || '#f2f2f7';

        // Switch to detail view
        $('#accounts-list').addClass('hidden');
        $('#account-detail').removeClass('hidden');

        // Fill summary
        $('#detail-account-name').text(window.FFPWA.escapeHtml(name));
        $('#detail-account-balance').text(window.FFPWA.formatMoney(balance, symbol, decimals))
            .removeClass('text-ios-red text-ios-text')
            .addClass(balance < 0 ? 'text-ios-red' : 'text-ios-text');
        $('#detail-account-role').html(
            '<span class="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full" ' +
            'style="color:' + roleColor + ';background:' + roleBg + ';">' +
            window.FFPWA.escapeHtml(roleLabel) + '</span>'
        );

        // Clear previous data, show loading
        $('#detail-list').empty();
        $('#detail-load-more').addClass('hidden');
        $('#detail-loading').removeClass('hidden');
        $('#detail-error').addClass('hidden');

        // Fetch first page
        fetchTransactions(accountId, 1).then(renderTransactions).catch(handleDetailError);
    }

    function renderTransactions(result) {
        $('#detail-loading').addClass('hidden');

        var data = result.transactions;
        var pagination = result.meta.pagination;
        currentPage = pagination.current_page || 1;
        totalPages = pagination.total_pages || 1;

        if (!data || data.length === 0) {
            if (currentPage === 1) {
                $('#detail-list').html(
                    '<div class="ios-status warning">' + __('detail.no_transactions') + '</div>'
                );
            }
            $('#detail-load-more').addClass('hidden');
            return;
        }

        var now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        var filtered = data.filter(function(tx) {
            var attrs = tx.attributes || {};
            var subTx = (attrs.transactions && attrs.transactions[0]) || {};
            var txDate = (subTx.date || '').split('T')[0];
            return txDate <= today;
        });

        if (filtered.length === 0 && currentPage === 1) {
            $('#detail-list').html(
                '<div class="ios-status warning">' + __('detail.no_transactions') + '</div>'
            );
            $('#detail-load-more').addClass('hidden');
            return;
        }

        var html = '';

        filtered.forEach(function(tx) {
            var attrs = tx.attributes || {};
            var subTx = (attrs.transactions && attrs.transactions[0]) || {};
            var type = subTx.type || 'withdrawal';
            var description = subTx.description || __('detail.no_description');
            var dateStr = subTx.date || '';
            var amount = parseFloat(subTx.amount) || 0;
            var code = subTx.currency_code || '';
            var symbol = subTx.currency_symbol || '$';
            var decimals = subTx.currency_decimal_places || 2;
            var sourceName = subTx.source_name || '';
            var destName = subTx.destination_name || '';

            var displayDate = window.FFPWA.formatDate(dateStr);
            var categoryName = subTx.category_name || '';

            // Indicador de reconciliada
            var reconciledBadge = subTx.reconciled ?
                '<span class="text-[10px] text-ios-green font-medium ml-1">✓ ' + __('history.reconciled') + '</span>' :
                '';

            // Determine display direction and other party
            var isNegative = (type === 'withdrawal');
            var otherParty = '';

            if (type === 'transfer') {
                otherParty = window.FFPWA.escapeHtml(sourceName) + ' → ' + window.FFPWA.escapeHtml(destName);
            } else if (isNegative) {
                otherParty = window.FFPWA.escapeHtml(destName);
            } else {
                otherParty = window.FFPWA.escapeHtml(sourceName);
            }

            var sign = isNegative ? '-' : '+';
            var colorClass = isNegative ? 'text-ios-red' : 'text-ios-green';

            html += '<div class="field-card mb-2 tx-card" ' +
                'data-group-id="' + tx.id + '" ' +
                'data-group-title="' + window.FFPWA.escapeHtml(attrs.group_title || '') + '" ' +
                'data-reconciled="' + (subTx.reconciled ? 'true' : 'false') + '" ' +
                'style="cursor:pointer;">' +
                '<div class="field-row" style="justify-content:space-between;padding:10px 14px;">' +
                    '<div style="flex:1;min-width:0;">' +
                        '<p class="text-[13px] text-ios-text-secondary">' + window.FFPWA.escapeHtml(displayDate) + reconciledBadge + '</p>' +
                        '<p class="text-[15px] font-medium text-ios-text truncate">' + window.FFPWA.escapeHtml(description) + '</p>' +
                        (otherParty ? '<p class="text-[12px] text-ios-text-secondary truncate">' + otherParty + '</p>' : '') +
                        (categoryName ? '<p class="text-[11px] text-ios-blue mt-0.5">📂 ' + window.FFPWA.escapeHtml(categoryName) + '</p>' : '') +
                    '</div>' +
                    '<div class="text-right ml-3 flex-shrink-0">' +
                        '<p class="text-[15px] font-semibold ' + colorClass + '">' + sign + window.FFPWA.formatMoney(amount, symbol, decimals) + '</p>' +
                        '<p class="text-[10px] text-ios-text-secondary mt-0.5">' + window.FFPWA.escapeHtml(code) + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        });

        if (currentPage === 1) {
            $('#detail-list').html(html);
        } else {
            $('#detail-list').append(html);
        }

        // Show load more if more pages
        if (currentPage < totalPages) {
            $('#detail-load-more').removeClass('hidden');
        } else {
            $('#detail-load-more').addClass('hidden');
        }
    }

    function handleDetailError(err) {
        $('#detail-loading').addClass('hidden');
        $('#detail-error').removeClass('hidden').text('❌ ' + err.message);
    }

    /* ─── Public entry point ─── */

    window.FFPWA.showAccountsScreen = function() {
        buildRoleLabels();
        buildLiabilityLabels();

        $('#accounts-list').removeClass('hidden');
        $('#account-detail').addClass('hidden');
        $('#accounts-list').empty();
        $('#accounts-error').addClass('hidden');
        $('#accounts-loading').removeClass('hidden');

        if (window.i18nTranslateDOM) window.i18nTranslateDOM();

        fetchAssetAccounts().then(function(assets) {
            renderAccounts(assets);
            return fetchLiabilityAccounts();
        }).then(function(liabilities) {
            renderLiabilities(liabilities);
            $('#accounts-loading').addClass('hidden');
        }).catch(function(err) {
            $('#accounts-loading').addClass('hidden');
            $('#accounts-error').removeClass('hidden').text('❌ ' + err.message);
        });
    };

    /* ─── Event wiring ─── */

    $(document).ready(function() {
        // Click on account card → show transactions
        $(document).on('click', '.account-card', function() {
            var id = $(this).data('account-id');
            var accountData = accountsMap[id];
            if (accountData) {
                showAccountDetail(id, accountData);
            }
        });

        // Click on transaction card → open edit/detail
        $(document).on('click', '.tx-card', function() {
            var groupId = $(this).data('group-id');
            var groupTitle = $(this).data('group-title') || '';
            var reconciled = $(this).data('reconciled') === true || $(this).data('reconciled') === 'true';

            // Back to accounts list
            $('#account-detail').addClass('hidden');
            $('#accounts-list').removeClass('hidden');

            // Switch to history tab
            window.FFPWA._editOrigin = 'accounts';
            window.switchTab('history');

            // Open transaction edit after DOM settles
            setTimeout(function() {
                if (window.FFPWA.showTransactionEdit) {
                    window.FFPWA.showTransactionEdit(groupId, 0, groupTitle, reconciled);
                }
            }, 100);
        });

        // Back button from detail → show accounts list
        $(document).on('click', '#detail-back-btn', function() {
            $('#accounts-list').removeClass('hidden');
            $('#account-detail').addClass('hidden');
            if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        });

        // Load more transactions
        $(document).on('click', '#detail-load-more', function() {
            if (!currentAccount) return;
            var nextPage = currentPage + 1;
            if (nextPage > totalPages) return;

            $('#detail-load-more').addClass('hidden');
            $('#detail-loading').removeClass('hidden');
            $('#detail-error').addClass('hidden');

            fetchTransactions(currentAccount.id, nextPage).then(renderTransactions).catch(handleDetailError);
        });
    });

    /* ─── Re-render on locale change ─── */

    $(window).on('localeChanged', function() {
        if (!$('#accounts-container').hasClass('hidden')) {
            // If in detail view, go back to list to avoid stale data
            if (!$('#account-detail').hasClass('hidden')) {
                $('#accounts-list').removeClass('hidden');
                $('#account-detail').addClass('hidden');
            }
            buildRoleLabels();
            buildLiabilityLabels();
            fetchAssetAccounts().then(function(assets) {
                renderAccounts(assets);
                return fetchLiabilityAccounts();
            }).then(function(liabilities) {
                renderLiabilities(liabilities);
            }).catch(function(err) {
                $('#accounts-loading').addClass('hidden');
            });
            if (window.i18nTranslateDOM) window.i18nTranslateDOM();
        }
    });

    /* ─── Exposed: refresh current account transactions ─── */
    window.FFPWA.refreshCurrentAccount = function() {
        if (currentAccount && currentAccount.id) {
            $('#detail-loading').removeClass('hidden');
            $('#detail-list').empty();
            $('#detail-load-more').addClass('hidden');
            $('#detail-error').addClass('hidden');
            fetchTransactions(currentAccount.id, 1).then(renderTransactions).catch(handleDetailError);
        }
    };

})();
