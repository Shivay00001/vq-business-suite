/* ============================================================
   U-ID lite — local profiles for the VisionQuantech Business Suite
   A profile is a local label (name + business), stored in localStorage.
   No passwords are collected. Nothing is sent anywhere.
   ============================================================ */
var UID = (function () {
  'use strict';

  var STORE = 'vqs:uid:profiles';
  var ACTIVE = 'vqs:uid:active';

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeStore(profiles) {
    localStorage.setItem(STORE, JSON.stringify(profiles));
  }
  function makeId() {
    return 'p_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }
  function validProfile(p) {
    return p && typeof p === 'object' &&
      typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() !== '';
  }

  var api = {};

  /** Create a profile. Returns the profile object. */
  api.create = function (name, business) {
    if (!name || !String(name).trim()) throw new Error('Profile name is required.');
    var profiles = readStore();
    var p = {
      id: makeId(),
      name: String(name).trim(),
      business: business ? String(business).trim() : '',
      createdAt: new Date().toISOString()
    };
    profiles.push(p);
    writeStore(profiles);
    if (!api.active()) api.setActive(p.id);
    return p;
  };

  /** List all profiles. */
  api.list = function () { return readStore(); };

  /** Get the active profile, or null. */
  api.active = function () {
    var id = null;
    try { id = localStorage.getItem(ACTIVE); } catch (e) {}
    if (!id) return null;
    var found = readStore().filter(function (p) { return p.id === id; })[0];
    return found || null;
  };

  /** Set the active profile by id. */
  api.setActive = function (id) {
    var exists = readStore().some(function (p) { return p.id === id; });
    if (!exists) throw new Error('Unknown profile id.');
    try { localStorage.setItem(ACTIVE, id); } catch (e) {}
    return api.active();
  };

  /** Delete a profile (and its active flag if set). */
  api.remove = function (id) {
    writeStore(readStore().filter(function (p) { return p.id !== id; }));
    try {
      if (localStorage.getItem(ACTIVE) === id) localStorage.removeItem(ACTIVE);
    } catch (e) {}
  };

  /** Export all profiles as a JSON string (for backup / moving devices). */
  api.export = function () {
    return JSON.stringify({ app: 'vq-uid', version: 1, profiles: readStore() }, null, 2);
  };

  /** Import profiles from a JSON string. Merges by id; returns count added. */
  api.import = function (json) {
    var obj;
    try { obj = JSON.parse(json); } catch (e) { throw new Error('Not valid JSON.'); }
    var incoming = Array.isArray(obj) ? obj : obj.profiles;
    if (!Array.isArray(incoming)) throw new Error('No profiles found in import.');
    var profiles = readStore();
    var ids = {};
    profiles.forEach(function (p) { ids[p.id] = true; });
    var added = 0;
    incoming.forEach(function (p) {
      if (validProfile(p) && !ids[p.id]) { profiles.push(p); ids[p.id] = true; added++; }
    });
    writeStore(profiles);
    return added;
  };

  /**
   * Render a small profile switcher into `el`:
   * a <select> of profiles + "New profile…" option (uses prompt()).
   * App pages can call this to personalize headers/saved docs.
   */
  api.renderSwitcher = function (el) {
    if (!el) return;
    function refresh() {
      var profiles = api.list();
      var active = api.active();
      var html = '<label class="vq-hint" for="vq-profile-sel">Profile</label>' +
        '<select id="vq-profile-sel" class="vq-profile-sel">' +
        profiles.map(function (p) {
          var label = p.name + (p.business ? ' — ' + p.business : '');
          return '<option value="' + p.id + '"' +
            (active && active.id === p.id ? ' selected' : '') + '>' +
            label.replace(/</g, '&lt;') + '</option>';
        }).join('') +
        '<option value="__new">+ New profile…</option></select>';
      el.innerHTML = html;
      var sel = el.querySelector('#vq-profile-sel');
      sel.addEventListener('change', function () {
        if (sel.value === '__new') {
          var name = window.prompt('Your name:');
          if (name && name.trim()) {
            var business = window.prompt('Business name (optional):') || '';
            try {
              var p = api.create(name, business);
              api.setActive(p.id);
            } catch (err) { window.alert(err.message); }
          }
          refresh();
        } else {
          try { api.setActive(sel.value); } catch (err) { window.alert(err.message); }
        }
        window.dispatchEvent(new CustomEvent('vqs:profilechange',
          { detail: { profile: api.active() } }));
      });
    }
    refresh();
  };

  return api;
})();
