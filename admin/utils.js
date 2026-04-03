/**
 * Keke Admin - Utility helpers
 * No build; plain JS for static loading.
 */
(function (global) {
  'use strict';

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Relative time e.g. "2 mins ago", "1 hour ago" */
  function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'Just now';
    if (sec < 3600) return Math.floor(sec / 60) + ' min' + (sec >= 120 ? 's' : '') + ' ago';
    if (sec < 86400) return Math.floor(sec / 3600) + ' hour' + (sec >= 7200 ? 's' : '') + ' ago';
    if (sec < 604800) return Math.floor(sec / 86400) + ' day' + (sec >= 172800 ? 's' : '') + ' ago';
    return formatDate(dateStr);
  }

  function formatCurrency(amount, currency = 'NGN') {
    if (amount == null || isNaN(amount)) return '—';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  /** Store +234, show 0. Format stored phone for display: +2349035689338 → 09035689338 */
  function formatPhoneForDisplay(phone) {
    if (!phone || typeof phone !== 'string') return '';
    const stripped = String(phone).replace(/^\+?234/, '').trim();
    if (!stripped) return '';
    return stripped.startsWith('0') ? stripped : '0' + stripped;
  }

  /** Mask phone for PII: show last 4 digits only. Use with formatPhoneForDisplay for local display. */
  function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return '—';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return '***' + digits.slice(-4);
  }

  /** Mask email for PII: show first 2 and domain */
  function maskEmail(email) {
    if (!email || typeof email !== 'string') return '—';
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const show = local.length <= 2 ? local : local.slice(0, 2) + '***';
    return show + '@' + domain;
  }

  /**
   * Export array of objects to CSV and trigger download
   * @param {Array<Object>} rows
   * @param {string} filename
   */
  function exportToCSV(rows, filename) {
    if (!rows || rows.length === 0) {
      return;
    }
    const keys = Object.keys(rows[0]);
    const header = keys.join(',');
    const escape = (v) => {
      const s = String(v == null ? '' : v);
      if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const body = rows.map((row) => keys.map((k) => escape(row[k])).join(',')).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function setQueryParam(name, value) {
    const params = new URLSearchParams(window.location.search);
    if (value == null || value === '') params.delete(name);
    else params.set(name, value);
    const qs = params.toString();
    const url = (window.location.pathname || '') + (qs ? '?' + qs : '');
    window.history.replaceState({}, '', url);
  }

  global.AdminUtils = {
    debounce,
    formatDate,
    timeAgo,
    formatCurrency,
    formatPhoneForDisplay,
    maskPhone,
    maskEmail,
    exportToCSV,
    getQueryParam,
    setQueryParam,
  };
})(typeof window !== 'undefined' ? window : this);
