/**
 * Keke Admin - Auth state and token handling
 */
(function (global) {
  'use strict';

  var TOKEN_KEY = 'adminToken';
  var ROLE_KEY = 'adminRole';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  function setRole(role) {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  }

  function getRole() {
    return localStorage.getItem(ROLE_KEY) || 'admin';
  }

  function isAuthenticated() {
    var t = getToken();
    if (!t) return false;
    try {
      var payload = JSON.parse(atob(t.split('.')[1]));
      var exp = payload.exp;
      if (exp && exp * 1000 < Date.now()) {
        removeToken();
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function getApiBaseUrl() {
    var config = (typeof global !== 'undefined' && global.__CONFIG__) ? global.__CONFIG__ : {};
    var base = (config.API_BASE_URL != null && config.API_BASE_URL !== '') ? String(config.API_BASE_URL) : '';
    if (!base && typeof window !== 'undefined' && window.location) {
      var h = window.location.hostname;
      base = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : (window.location.protocol + '//' + h + ':8000');
    }
    return base.replace(/\/$/, '');
  }

  function logout() {
    var token = getToken();
    var done = function () {
      removeToken();
      if (typeof window.onAdminUnauthorized === 'function') window.onAdminUnauthorized();
    };
    if (!token) {
      done();
      return Promise.resolve();
    }
    return fetch(getApiBaseUrl() + '/api/admin/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
    }).catch(function () {}).finally(done);
  }

  global.AdminAuth = {
    getToken,
    setToken,
    removeToken,
    setRole,
    getRole,
    isAuthenticated,
    logout,
  };
})(typeof window !== 'undefined' ? window : this);
