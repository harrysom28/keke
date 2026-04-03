/**
 * Keke Admin - API helper
 * Auto auth header, 401 → logout, central error handling.
 */
(function (global) {
  'use strict';

  var Auth = global.AdminAuth;

  function getBaseUrl() {
    var config = (typeof global !== 'undefined' && global.__CONFIG__) ? global.__CONFIG__ : {};
    var base = (config.API_BASE_URL != null && config.API_BASE_URL !== '') ? String(config.API_BASE_URL) : '';
    if (!base && typeof window !== 'undefined' && window.location) {
      var h = window.location.hostname;
      base = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : (window.location.protocol + '//' + h + ':8000');
    }
    return base.replace(/\/$/, '');
  }

  function getToken() {
    return Auth ? Auth.getToken() : localStorage.getItem('adminToken');
  }

  function stringError(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.message) return String(val.message);
    if (typeof val === 'object' && val.error) return String(val.error);
    return String(val);
  }

  function clearAuth() {
    if (Auth && typeof Auth.logout === 'function') Auth.logout();
    else {
      localStorage.removeItem('adminToken');
      if (typeof window.onAdminUnauthorized === 'function') window.onAdminUnauthorized();
    }
  }

  /**
   * @param {string} path - e.g. "/admin/dashboard/stats"
   * @param {RequestInit} opts - fetch options
   * @returns {Promise<{ data: any, status: number }>}
   */
  async function request(path, opts) {
    const base = getBaseUrl();
    const url = path.startsWith('http') ? path : base + (path.startsWith('/') ? '' : '/') + path;
    const token = getToken();
    const headers = Object.assign(
      {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      (opts && opts.headers) || {}
    );
    if (token) headers.Authorization = 'Bearer ' + token;

    let res;
    try {
      res = await fetch(url, Object.assign({}, opts, { headers }));
    } catch (err) {
      return { error: stringError(err.message || 'Network error'), status: 0, data: null };
    }

    let data = null;
    var contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
    }

    if (res.status === 401) {
      var isLoginRequest = (opts && opts.method === 'POST') && (path === '/api/admin/login' || path.endsWith('/admin/login'));
      if (!isLoginRequest) {
        clearAuth();
        return { error: 'Session expired. Please log in again.', status: 401, data: null };
      }
      var loginMsg = (data && (data.message || data.error)) || 'Invalid email or password';
      return { error: stringError(loginMsg), status: 401, data: data };
    }

    if (!res.ok) {
      var message =
        (data && data.message) ||
        (data && data.error) ||
        (typeof data === 'string' ? data : null) ||
        'Request failed';
      return { error: stringError(message), status: res.status, data };
    }

    return { data, status: res.status, error: null };
  }

  function get(path) {
    return request(path, { method: 'GET' });
  }

  function post(path, body) {
    return request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  function patch(path, body) {
    return request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }

  function del(path) {
    return request(path, { method: 'DELETE' });
  }

  global.AdminApi = {
    getBaseUrl,
    getToken,
    request,
    get,
    post,
    patch,
    delete: del,
  };
})(typeof window !== 'undefined' ? window : this);
