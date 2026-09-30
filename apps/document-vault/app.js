/* ============================================================
   VisionQuantech Business Suite — Encrypted Document Vault (lite)
   app.js for apps/document-vault/

   Browser-local starter vault. Uses Vault.setPassphrase() for
   AES-GCM encryption when available; continues unencrypted with
   an honest notice otherwise. This is NOT a backup — data lives
   in this browser's localStorage.

   Pure functions first (no DOM) — tested under node:
   expiryStatus, filterDocs, buildExport, parseImport.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure helpers ---------------- */

  var MAX_FILE_BYTES = 4 * 1024 * 1024; // ~4 MB cap for attachments

  /**
   * Expiry state for an ISO date (YYYY-MM-DD). todayISO optional (for tests).
   * Returns 'expired' | 'due-soon' (within 30 days) | 'ok' | 'none'.
   */
  function expiryStatus(expiryISO, todayISO) {
    if (!expiryISO) return 'none';
    var t = todayISO || new Date().toISOString().slice(0, 10);
    var diff = Math.round((Date.parse(expiryISO) - Date.parse(t)) / 86400000);
    if (!isFinite(diff)) return 'none';
    if (diff < 0) return 'expired';
    if (diff <= 30) return 'due-soon';
    return 'ok';
  }

  /** Filter docs by free-text query (title+notes) and category. */
  function filterDocs(docs, query, category) {
    var q = String(query || '').trim().toLowerCase();
    return (docs || []).filter(function (d) {
      if (!d) return false;
      if (category && category !== 'all' && d.category !== category) return false;
      if (q) {
        var hay = ((d.title || '') + ' ' + (d.notes || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /** Build the export envelope (JSON string). */
  function buildExport(entries) {
    return JSON.stringify({
      app: 'document-vault', version: 1,
      exportedAt: new Date().toISOString(),
      entries: entries || []
    }, null, 2);
  }

  /** Validate + extract entries from an import JSON string. Throws on bad input. */
  function parseImport(json) {
    var obj;
    try { obj = JSON.parse(json); } catch (e) { throw new Error('Not valid JSON.'); }
    var entries = Array.isArray(obj) ? obj : obj.entries;
    if (!Array.isArray(entries)) throw new Error('No document entries found in this file.');
    entries.forEach(function (d, i) {
      if (!d || typeof d !== 'object' || !d.title) {
        throw new Error('Entry #' + (i + 1) + ' is missing a title.');
      }
    });
    return entries;
  }

  function fmtBytes(n) {
    n = +n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    expiryStatus: expiryStatus, filterDocs: filterDocs,
    buildExport: buildExport, parseImport: parseImport,
    fmtBytes: fmtBytes, esc: esc, MAX_FILE_BYTES: MAX_FILE_BYTES,
    CATEGORIES: ['GST/tax', 'invoices', 'HR', 'legal', 'other']
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else if (typeof window !== 'undefined') {
    window.DocVaultApp = API;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'document-vault';
  var FREE_DOC_LIMIT = 25; // total documents on the free plan

  function $(id) { return document.getElementById(id); }

  var _docs = []; // cached decrypted entries: [{key, doc}]

  /* ---------- passphrase ---------- */

  async function setPassphrase() {
    var pw = $('dv-pass').value;
    if (!pw) { alert('Enter a passphrase first.'); return; }
    try {
      await Vault.setPassphrase(pw);
      $('dv-pass').value = '';
      updateLockUI();
      await refresh();
    } catch (e) {
      // Contract: continue unencrypted with an honest notice.
      updateLockUI(e.message);
    }
  }

  function lockVault() {
    Vault.clearPassphrase();
    _docs = [];
    updateLockUI();
    renderList();
    renderReminders();
  }

  function updateLockUI(errMsg) {
    var on = Vault.hasPassphrase();
    $('dv-lock-state').innerHTML = on
      ? '<span class="lock-on">Locked with passphrase — entries are AES-256-GCM encrypted in this browser.</span>'
      : '<span class="lock-off">No passphrase — entries are stored as plain JSON in this browser.</span>' +
        (errMsg ? '<div class="vq-hint">Encryption unavailable: ' + esc(errMsg) + ' Continuing unencrypted.</div>' : '');
    $('dv-lock-btn').style.display = on ? '' : 'none';
  }

  /* ---------- data ---------- */

  async function refresh() {
    _docs = [];
    var entries = [];
    try { entries = await Vault.list(SLUG); } catch (e) {}
    for (var i = 0; i < entries.length; i++) {
      try {
        var doc = await Vault.load(SLUG, entries[i].key);
        if (doc) _docs.push({ key: entries[i].key, doc: doc });
      } catch (e) {
        _docs.push({ key: entries[i].key, doc: null, locked: true });
      }
    }
    _docs.sort(function (a, b) {
      return String(b.doc && b.doc.createdAt || '').localeCompare(String(a.doc && a.doc.createdAt || ''));
    });
    renderList();
    renderReminders();
    updateCount();
  }

  function updateCount() {
    var n = _docs.length;
    $('dv-count').textContent = n + ' / ' + FREE_DOC_LIMIT + ' documents (free plan)';
  }

  function gateAllows() {
    if (_docs.length >= FREE_DOC_LIMIT) {
      Freemium.renderUpsell($('dv-gate'), SLUG, FREE_DOC_LIMIT);
      $('dv-gate').scrollIntoView({ behavior: 'smooth' });
      return false;
    }
    return true;
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Could not read file.')); };
      fr.readAsDataURL(file);
    });
  }

  async function addDoc() {
    if (!gateAllows()) return;
    var title = $('dv-title').value.trim();
    if (!title) { alert('Give the document a title.'); return; }
    var fileInput = $('dv-file');
    var file = fileInput.files && fileInput.files[0];
    var attachment = null;
    if (file) {
      if (file.size > MAX_FILE_BYTES) {
        alert('File is ' + fmtBytes(file.size) + ' — the cap is ' + fmtBytes(MAX_FILE_BYTES) +
              '. Please attach a smaller scan/photo.');
        return;
      }
      try {
        var dataUrl = await readFileAsDataURL(file);
        attachment = { name: file.name, type: file.type || 'application/octet-stream',
                       size: file.size, dataUrl: dataUrl };
      } catch (e) { alert('Could not read file: ' + e.message); return; }
    }
    var doc = {
      title: title,
      category: $('dv-cat').value,
      notes: $('dv-notes').value.trim(),
      expiry: $('dv-expiry').value || '',
      attachment: attachment,
      createdAt: new Date().toISOString()
    };
    var key = 'doc-' + Date.now().toString(36) + '-' +
              Math.random().toString(36).slice(2, 7);
    try {
      var res = await Vault.save(SLUG, key, doc);
      $('dv-title').value = ''; $('dv-notes').value = '';
      $('dv-expiry').value = ''; fileInput.value = '';
      $('dv-file-info').textContent = '';
      await refresh();
      if (!res.encrypted) {
        $('dv-saved-note').textContent =
          'Saved unencrypted (no passphrase set). Set a passphrase above to encrypt.';
      } else { $('dv-saved-note').textContent = 'Saved encrypted.'; }
    } catch (e) { alert('Could not save: ' + e.message); }
  }

  /* ---------- rendering ---------- */

  function badgeFor(st) {
    if (st === 'expired') return '<span class="badge b-exp">Expired</span>';
    if (st === 'due-soon') return '<span class="badge b-soon">Due soon</span>';
    return '';
  }

  function renderList() {
    var list = $('dv-list');
    var docs = filterDocs(_docs.map(function (x) { return x.doc; }).filter(Boolean),
                          $('dv-search').value, $('dv-filter').value);
    // map back to keys
    var byTitle = {};
    _docs.forEach(function (x) { if (x.doc) byTitle[x.doc.title + '|' + x.doc.createdAt] = x.key; });
    if (_docs.some(function (x) { return x.locked; })) {
      list.innerHTML = '<div class="vq-notice"><strong>Some entries are encrypted.</strong> ' +
        'Set your vault passphrase above to unlock them.</div>';
      return;
    }
    if (!docs.length) {
      list.innerHTML = '<p class="vq-hint">No documents yet. Add your first one above.</p>';
      return;
    }
    list.innerHTML = docs.map(function (d) {
      var key = byTitle[d.title + '|' + d.createdAt];
      var st = expiryStatus(d.expiry);
      var att = d.attachment
        ? '<div class="vq-hint">Attachment: ' + esc(d.attachment.name) + ' (' + fmtBytes(d.attachment.size) + ') ' +
          '<button type="button" class="linklike" data-dl="' + esc(key) + '">download</button></div>'
        : '';
      return '<div class="doc-row"><div><strong>' + esc(d.title) + '</strong> ' + badgeFor(st) +
        '<div class="vq-hint">' + esc(d.category) +
        (d.expiry ? ' &middot; expires ' + esc(d.expiry) : '') + '</div>' +
        (d.notes ? '<div class="dnotes">' + esc(d.notes) + '</div>' : '') + att +
        '</div><div class="row-actions">' +
        '<button class="vq-btn ghost sm danger" data-del="' + esc(key) + '">Delete</button></div></div>';
    }).join('');

    list.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Delete this document?')) return;
        await Vault.remove(SLUG, b.getAttribute('data-del'));
        await refresh();
      });
    });
    list.querySelectorAll('[data-dl]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var rec = _docs.filter(function (x) { return x.key === b.getAttribute('data-dl'); })[0];
        var a = rec && rec.doc && rec.doc.attachment;
        if (!a) return;
        var link = document.createElement('a');
        link.href = a.dataUrl;
        link.download = a.name || 'attachment';
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    });
  }

  function renderReminders() {
    var box = $('dv-reminders');
    var items = [];
    _docs.forEach(function (x) {
      if (!x.doc || !x.doc.expiry) return;
      var st = expiryStatus(x.doc.expiry);
      if (st === 'expired' || st === 'due-soon') items.push({ d: x.doc, st: st });
    });
    items.sort(function (a, b) { return String(a.d.expiry).localeCompare(String(b.d.expiry)); });
    box.innerHTML = items.length
      ? '<h3>Expiry reminders</h3>' + items.map(function (it) {
          return '<div class="doc-row"><div><strong>' + esc(it.d.title) + '</strong> ' +
            badgeFor(it.st) + '<div class="vq-hint">' + esc(it.d.category) +
            ' &middot; expires ' + esc(it.d.expiry) + '</div></div></div>';
        }).join('')
      : '<p class="vq-hint">No upcoming expiries. Documents with an expiry date show up here 30 days ahead.</p>';
  }

  /* ---------- export / import ---------- */

  function doExport() {
    var docs = _docs.map(function (x) { return x.doc; }).filter(Boolean);
    var blob = new Blob([buildExport(docs)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document-vault-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function doImport(file) {
    var fr = new FileReader();
    fr.onload = async function () {
      var entries;
      try { entries = parseImport(fr.result); }
      catch (e) { alert('Import failed: ' + e.message); return; }
      if (_docs.length + entries.length > FREE_DOC_LIMIT &&
          !confirm('Importing ' + entries.length + ' documents exceeds the ' + FREE_DOC_LIMIT +
                   '-document free plan (' + _docs.length + ' already saved). Import anyway?')) {
        return;
      }
      var added = 0;
      for (var i = 0; i < entries.length; i++) {
        var d = entries[i];
        var key = 'doc-imp-' + Date.now().toString(36) + '-' + i;
        try { await Vault.save(SLUG, key, d); added++; } catch (e) {}
      }
      await refresh();
      alert('Imported ' + added + ' of ' + entries.length + ' documents.');
    };
    fr.onerror = function () { alert('Could not read the file.'); };
    fr.readAsText(file);
  }

  /* ---------- init ---------- */

  function init() {
    Ads.render($('ad-top'), 'document-vault-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'document-vault-bottom', 'leaderboard');

    SEO.faq([
      { q: 'Is the document vault really encrypted?',
        a: 'Yes, when you set a passphrase: entries are encrypted with AES-256-GCM (via WebCrypto) before being stored, and the key lives only in memory until you close the tab. Without a passphrase, entries are stored as plain JSON in your browser.' },
      { q: 'Where is my data stored?',
        a: 'Only in this browser\u2019s localStorage, under this app\u2019s private namespace. Nothing is uploaded to any server. That also means clearing browser data deletes your vault \u2014 use the JSON export as a backup.' },
      { q: '\u0921\u0949\u0915\u094d\u092f\u0942\u092e\u0947\u0902\u091f \u0935\u0949\u0932\u094d\u091f \u0915\u0948\u0938\u0947 \u0915\u093e\u092e \u0915\u0930\u0924\u093e \u0939\u0948? (How does the document vault work?)',
        a: '\u092a\u093e\u0938\u092b\u094d\u0930\u0947\u091c\u093c \u0938\u0947\u091f \u0915\u0930\u0947\u0902, GST/\u091f\u0948\u0915\u094d\u0938, \u0907\u0928\u0935\u0949\u092f\u0938, HR \u092f\u093e \u0915\u093e\u0928\u0942\u0928\u0940 \u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c\u093c \u091c\u094b\u0921\u093c\u0947\u0902, \u0938\u092e\u093e\u092a\u094d\u0924\u093f \u0924\u093f\u0925\u093f \u0921\u093e\u0932\u0947\u0902 \u2014 \u0935\u0949\u0932\u094d\u091f \u0906\u092a\u0915\u094b \u0938\u092e\u092f \u092a\u0930 \u092f\u093e\u0926 \u0926\u093f\u0932\u093e\u090f\u0917\u093e\u0964 \u0938\u093e\u0930\u093e \u0921\u0947\u091f\u093e \u0906\u092a\u0915\u0947 \u092c\u094d\u0930\u093e\u0909\u091c\u093c\u0930 \u092e\u0947\u0902 \u0939\u0940 \u0930\u0939\u0924\u093e \u0939\u0948\u0964' },
      { q: 'What is the file attachment limit?',
        a: 'About 4 MB per attachment. Large scans should be compressed first \u2014 browsers have limited localStorage space (usually ~5 MB per site).' },
      { q: 'How many documents are free?',
        a: '25 documents on the free plan. Exporting your vault to JSON for backup is always free and unlimited.' }
    ]);
    SEO.softwareApp({
      name: 'Encrypted Document Vault — GST, Invoices & Legal Docs',
      description: 'Free browser-local encrypted document vault for Indian SMEs: store GST/tax papers, invoices, HR and legal documents with expiry reminders.',
      keywords: ['document vault', 'encrypted document storage', 'GST document storage', '\u0921\u0949\u0915\u094d\u092f\u0942\u092e\u0947\u0902\u091f \u0935\u0949\u0932\u094d\u091f', 'invoice organizer']
    });

    $('dv-set-pass').addEventListener('click', setPassphrase);
    $('dv-lock-btn').addEventListener('click', lockVault);
    $('dv-add').addEventListener('click', addDoc);
    $('dv-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      $('dv-file-info').textContent = f
        ? esc(f.name) + ' (' + fmtBytes(f.size) + ')' +
          (f.size > MAX_FILE_BYTES ? ' — too large, cap is ' + fmtBytes(MAX_FILE_BYTES) : '')
        : '';
    });
    $('dv-search').addEventListener('input', renderList);
    $('dv-filter').addEventListener('change', renderList);
    $('dv-export').addEventListener('click', doExport);
    $('dv-import').addEventListener('change', function () {
      if (this.files && this.files[0]) doImport(this.files[0]);
      this.value = '';
    });

    updateLockUI();
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
