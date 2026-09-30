/* ============================================================
   U-VAULT lite — per-app namespaced storage for the
   VisionQuantech Business Suite.

   - Without a passphrase: plain JSON in localStorage
     ("stored on this device, unencrypted").
   - With a passphrase: PBKDF2-SHA256 -> AES-GCM-256, random IV per
     record. The derived key lives in memory ONLY and is wiped when
     the tab closes. The passphrase itself is never stored.

   All methods are async (WebCrypto). Always await them.

     await Vault.save('invoice-generator', 'inv-2026-001', {...});
     await Vault.load('invoice-generator', 'inv-2026-001');
     await Vault.list('invoice-generator');
     await Vault.remove('invoice-generator', 'inv-2026-001');
     await Vault.setPassphrase('my secret');  // enables encryption
   ============================================================ */
var Vault = (function () {
  'use strict';

  var PREFIX = 'vqs:vault:';
  var PBKDF2_ITER = 100000;
  var SALT_KEY = PREFIX + '__salt';

  var _cryptoKey = null;   // in-memory only, never persisted

  function ns(app) { return PREFIX + String(app); }
  function recordKey(app, key) { return ns(app) + ':' + String(key); }
  function indexKey(app) { return ns(app) + ':__index'; }

  function readIndex(app) {
    try {
      var raw = localStorage.getItem(indexKey(app));
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeIndex(app, idx) {
    localStorage.setItem(indexKey(app), JSON.stringify(idx));
  }

  function cryptoOK() {
    return !!(window.crypto && window.crypto.subtle &&
              window.TextEncoder && window.isSecureContext !== false);
  }

  /* ---- base64 helpers for ArrayBuffers ---- */
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(s);
  }
  function b64ToBuf(b64) {
    var s = atob(b64), bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }

  function getSalt() {
    var salt = localStorage.getItem(SALT_KEY);
    if (!salt) {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      salt = bufToB64(bytes.buffer);
      localStorage.setItem(SALT_KEY, salt);
    }
    return b64ToBuf(salt);
  }

  async function encryptJSON(data) {
    var iv = new Uint8Array(12);
    window.crypto.getRandomValues(iv);
    var plain = new TextEncoder().encode(JSON.stringify(data));
    var ct = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, _cryptoKey, plain);
    return { v: 1, enc: 1, iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
  }

  async function decryptJSON(envelope) {
    var plain = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(envelope.iv)) },
      _cryptoKey, b64ToBuf(envelope.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  var api = {};

  /**
   * Enable encryption for this tab session. Rejects if WebCrypto is
   * unavailable (e.g. non-secure context); the app should then
   * continue unencrypted and say so.
   */
  api.setPassphrase = async function (passphrase) {
    if (!passphrase || !String(passphrase).trim()) {
      throw new Error('Passphrase is required.');
    }
    if (!cryptoOK() || !window.crypto.subtle) {
      throw new Error('WebCrypto is unavailable in this browser/context — ' +
                      'continuing without encryption.');
    }
    var baseKey = await window.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(String(passphrase)),
      { name: 'PBKDF2' }, false, ['deriveKey']);
    _cryptoKey = await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: getSalt(), iterations: PBKDF2_ITER, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return true;
  };

  api.hasPassphrase = function () { return !!_cryptoKey; };

  /** Lock the vault for this tab (wipes the in-memory key). */
  api.clearPassphrase = function () { _cryptoKey = null; };

  /** Save `data` under `key` in the app's namespace. */
  api.save = async function (app, key, data) {
    if (!app || !key) throw new Error('Vault.save needs app and key.');
    var envelope;
    if (_cryptoKey) {
      envelope = await encryptJSON(data);
    } else {
      envelope = { v: 1, enc: 0, data: data };
    }
    envelope.updatedAt = new Date().toISOString();
    localStorage.setItem(recordKey(app, key), JSON.stringify(envelope));

    var idx = readIndex(app).filter(function (e) { return e.key !== String(key); });
    idx.push({ key: String(key), updatedAt: envelope.updatedAt, encrypted: envelope.enc === 1 });
    writeIndex(app, idx);
    return { ok: true, encrypted: envelope.enc === 1 };
  };

  /** Load data saved under `key`. Returns null if missing. */
  api.load = async function (app, key) {
    if (!app || !key) throw new Error('Vault.load needs app and key.');
    var raw = localStorage.getItem(recordKey(app, key));
    if (!raw) return null;
    var envelope;
    try { envelope = JSON.parse(raw); } catch (e) { return null; }
    if (envelope.enc === 1) {
      if (!_cryptoKey) throw new Error('This record is encrypted — set the vault passphrase first.');
      return decryptJSON(envelope);
    }
    return envelope.data === undefined ? null : envelope.data;
  };

  /** List records in the app's namespace: [{key, updatedAt, encrypted}]. */
  api.list = async function (app) {
    if (!app) throw new Error('Vault.list needs app.');
    return readIndex(app);
  };

  /** Delete a record. */
  api.remove = async function (app, key) {
    if (!app || !key) throw new Error('Vault.remove needs app and key.');
    localStorage.removeItem(recordKey(app, key));
    writeIndex(app, readIndex(app).filter(function (e) { return e.key !== String(key); }));
    return { ok: true };
  };

  return api;
})();
