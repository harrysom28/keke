(function (global) {
  'use strict';

  var Auth = global.AgentAuth;
  var refreshInFlight = null;

  function getBaseUrl() {
    var config = global.__CONFIG__ || {};
    var base = config.API_BASE_URL ? String(config.API_BASE_URL) : '';
    if (!base && global.location) {
      var h = global.location.hostname;
      base = (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:8000' : (global.location.protocol + '//' + h + ':8000');
    }
    return base.replace(/\/$/, '');
  }

  function stringError(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.message) return String(val.message);
    if (typeof val === 'object' && val.error) return String(val.error);
    return String(val);
  }

  function refreshAccess() {
    if (refreshInFlight) return refreshInFlight;
    var refresh = localStorage.getItem('agentRefreshToken');
    if (!refresh) return Promise.resolve(null);
    refreshInFlight = fetch(getBaseUrl() + '/api/auth/user/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: refresh, device_id: 'agent-web' }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) return null;
        var token = data && data.authorisation && data.authorisation.token;
        var nextRefresh = data && data.authorisation && data.authorisation.refresh_token;
        if (!token) return null;
        if (Auth) Auth.setSession(token, nextRefresh, Auth.getAgent());
        return token;
      }).catch(function () { return null; });
    }).catch(function () { return null; }).then(function (token) {
      refreshInFlight = null;
      return token;
    });
    return refreshInFlight;
  }

  async function request(path, opts, retried) {
    opts = opts || {};
    var url = path.startsWith('http') ? path : getBaseUrl() + (path.startsWith('/') ? '' : '/') + path;
    var token = Auth ? Auth.getToken() : localStorage.getItem('agentToken');
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    var isForm = opts.body instanceof FormData;
    if (!isForm && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers.Authorization = 'Bearer ' + token;

    var timeout = opts.timeout != null ? opts.timeout : (isForm ? 180000 : 75000);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeout);

    var fetchOpts = {
      method: opts.method || 'GET',
      headers: headers,
      signal: controller.signal,
    };
    if (opts.body != null) fetchOpts.body = opts.body;

    var res;
    try {
      res = await fetch(url, fetchOpts);
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        return {
          error: 'Request timed out after ' + Math.round(timeout / 1000) + 's. Try again.',
          status: 0,
          data: null,
        };
      }
      return { error: stringError(err.message || 'Network error'), status: 0, data: null };
    }
    clearTimeout(timer);

    var data = null;
    var contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { data = await res.json(); } catch (_) { data = null; }
    }

    if (res.status === 401) {
      var isAuth = path.indexOf('/agents/auth/') !== -1 || path.indexOf('/auth/user/refresh') !== -1;
      if (!isAuth && !retried) {
        var next = await refreshAccess();
        if (next) return request(path, opts, true);
      }
      if (!isAuth && Auth) {
        Auth.clearSession();
        if (typeof window.onAgentUnauthorized === 'function') window.onAgentUnauthorized();
      }
      return { error: stringError((data && (data.message || data.error)) || 'Session expired'), status: 401, data: data };
    }

    if (!res.ok) {
      return {
        error: stringError((data && (data.message || data.error)) || 'Request failed'),
        status: res.status,
        data: data,
      };
    }

    return { data: data, status: res.status, error: null };
  }

  global.AgentApi = {
    getBaseUrl,
    request: function (path, opts) { return request(path, opts, false); },
    get: function (path) { return request(path, { method: 'GET' }, false); },
    post: function (path, body) {
      return request(path, {
        method: 'POST',
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
      }, false);
    },
    patch: function (path, body) {
      return request(path, {
        method: 'PATCH',
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
      }, false);
    },
  };
})(typeof window !== 'undefined' ? window : this);
