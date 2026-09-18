(function (global) {
  'use strict';

  var TOKEN_KEY = 'agentToken';
  var REFRESH_KEY = 'agentRefreshToken';
  var AGENT_KEY = 'agentProfile';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, refresh, agent) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    if (agent) localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(AGENT_KEY);
  }

  function getAgent() {
    try {
      return JSON.parse(localStorage.getItem(AGENT_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function isAuthenticated() {
    var t = getToken();
    if (!t) return false;
    try {
      var payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearSession();
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  global.AgentAuth = {
    getToken,
    setSession,
    clearSession,
    getAgent,
    isAuthenticated,
  };
})(typeof window !== 'undefined' ? window : this);
