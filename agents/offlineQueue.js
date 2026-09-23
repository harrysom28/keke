/**
 * Persist failed agent driver registrations (fields + photo blobs) in IndexedDB
 * and flush them when the phone is back online.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'keke-agent-offline';
  var STORE = 'uploads';
  var VERSION = 1;
  var CHANGE = 'agent-offline-queue-changed';
  var flushing = false;

  function notify() {
    try {
      window.dispatchEvent(new Event(CHANGE));
    } catch (_) { /* ignore */ }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function list() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = function () {
          var rows = req.result || [];
          rows.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
          resolve(rows);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function put(entry) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = function () { resolve(entry); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function remove(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function enqueueFromFormData(fd) {
    var fields = {};
    var files = [];
    fd.forEach(function (value, key) {
      if (value instanceof Blob) {
        files.push({
          field: key,
          blob: value,
          name: value.name || (key + '.jpg'),
          type: value.type || 'image/jpeg',
        });
      } else {
        fields[key] = value;
      }
    });
    var entry = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      at: Date.now(),
      name: fields.name || 'Driver',
      phone: fields.phone || '',
      fields: fields,
      files: files,
    };
    return put(entry).then(function () {
      notify();
      return entry;
    });
  }

  function toFormData(entry) {
    var fd = new FormData();
    var fields = entry.fields || {};
    Object.keys(fields).forEach(function (key) {
      fd.append(key, fields[key]);
    });
    (entry.files || []).forEach(function (file) {
      fd.append(file.field, file.blob, file.name || (file.field + '.jpg'));
    });
    return fd;
  }

  async function flush(postFn) {
    if (flushing) {
      var current = await list();
      return { sent: 0, remaining: current.length };
    }
    flushing = true;
    var sent = 0;
    try {
      var items = await list();
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var res;
        try {
          res = await postFn('/api/agents/drivers', toFormData(item));
        } catch (_) {
          break;
        }
        if (res && !res.error) {
          await remove(item.id);
          sent += 1;
          continue;
        }
        if (res && res.status === 409) {
          await remove(item.id);
          continue;
        }
        if (res && res.status === 401) {
          break;
        }
        break;
      }
    } finally {
      flushing = false;
      notify();
    }
    var remaining = await list();
    return { sent: sent, remaining: remaining.length };
  }

  global.AgentOfflineQueue = {
    list: list,
    put: put,
    remove: remove,
    enqueueFromFormData: enqueueFromFormData,
    toFormData: toFormData,
    flush: flush,
  };
})(typeof window !== 'undefined' ? window : this);
