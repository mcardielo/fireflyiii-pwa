/**
 * utils.js — Shared helpers for Firefly PWA
 * Single source of truth for formatting and escaping functions.
 */
(function() {
    'use strict';

    /**
     * Escape HTML special characters to prevent XSS.
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Format a date string for display.
     * Uses locale-aware formatting with fallback.
     */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        var locale = window.getLocale ? window.getLocale() : 'es';
        try {
            return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (e) {
            return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
        }
    }

    /**
     * Format a monetary amount with currency symbol.
     */
    function formatMoney(amount, symbol, decimals) {
        if (amount === undefined || amount === null) amount = 0;
        var negative = amount < 0;
        var formatted = Math.abs(Number(amount)).toFixed(decimals);
        var parts = formatted.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (negative ? '-' : '') + (symbol || '$') + ' ' + parts.join('.');
    }

    window.FFPWA = window.FFPWA || {};
    window.FFPWA.escapeHtml = escapeHtml;
    window.FFPWA.formatDate = formatDate;
    window.FFPWA.formatMoney = formatMoney;

})();
