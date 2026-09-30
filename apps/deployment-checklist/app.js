/* ============================================================
   Deployment Checklist — pure checklist logic (DOM-free,
   unit-testable in node). Pre/during/post-deploy sections,
   progress math, and Markdown export.
   ============================================================ */

function defaultChecklist() {
  return [
    { title: 'Pre-deploy', items: [
      { id: 'pre1', text: 'Code reviewed and merged to main', done: false },
      { id: 'pre2', text: 'CI is green — all tests pass', done: false },
      { id: 'pre3', text: 'DB migrations reviewed; rollback plan written', done: false },
      { id: 'pre4', text: 'Production env vars / secrets are set', done: false },
      { id: 'pre5', text: 'Version tag created (e.g. v1.4.0)', done: false },
      { id: 'pre6', text: 'Changelog / release notes updated', done: false },
      { id: 'pre7', text: 'Production database backup taken', done: false },
      { id: 'pre8', text: 'Feature flags configured for the rollout', done: false }
    ]},
    { title: 'During deploy', items: [
      { id: 'dur1', text: 'Downtime announced / maintenance page ready (if needed)', done: false },
      { id: 'dur2', text: 'Deployed to staging first and smoke-tested', done: false },
      { id: 'dur3', text: 'Database migrations run successfully', done: false },
      { id: 'dur4', text: 'Deployed to production (rolling / blue-green)', done: false },
      { id: 'dur5', text: 'Health checks passing on all new instances', done: false },
      { id: 'dur6', text: 'Error rates monitored for 15 minutes post-deploy', done: false }
    ]},
    { title: 'Post-deploy', items: [
      { id: 'post1', text: 'Smoke tests pass on production', done: false },
      { id: 'post2', text: 'Key user flows verified (login, checkout, payments)', done: false },
      { id: 'post3', text: 'Logs and metrics dashboards checked', done: false },
      { id: 'post4', text: 'Backups confirmed running on schedule', done: false },
      { id: 'post5', text: 'Team / stakeholders notified of completion', done: false },
      { id: 'post6', text: 'Rollback runbook updated if anything was odd', done: false },
      { id: 'post7', text: 'Retrospective notes captured', done: false }
    ]}
  ];
}

/** { done, total, pct } for a checklist state (array of sections). */
function checklistProgress(sections) {
  var done = 0, total = 0;
  (sections || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      total++;
      if (it.done) done++;
    });
  });
  return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
}

/** Export the checklist as Markdown. */
function checklistMarkdown(sections, title) {
  var L = ['# ' + (title || 'Deployment Checklist'), ''];
  (sections || []).forEach(function (s) {
    L.push('## ' + s.title);
    (s.items || []).forEach(function (it) {
      L.push('- [' + (it.done ? 'x' : ' ') + '] ' + it.text);
    });
    L.push('');
  });
  var p = checklistProgress(sections);
  L.push('_Progress: ' + p.done + '/' + p.total + ' (' + p.pct + '%)_');
  L.push('');
  return L.join('\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function dclInit() {
  var SLUG = 'deployment-checklist';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Deployment se pehle kya check karna chahiye? (Pre-deploy checklist?)',
      a: 'Code review + merge, green CI, reviewed DB migrations with a rollback plan, production secrets set, version tag, changelog, and a fresh production DB backup.' },
    { q: 'Deploy ke dauraan kya monitor karein?',
      a: 'Deploy staging first and smoke-test, run migrations, then rolling/blue-green deploy to prod. Watch health checks and error rates for at least 15 minutes after.' },
    { q: 'Deploy ke baad kya verify karein? (Post-deploy checks?)',
      a: 'Smoke tests on production, key user flows (login, checkout, payments), logs/metrics dashboards, backup schedules, and stakeholder notification.' },
    { q: 'Rollback plan kyon zaroori hai?',
      a: 'Every deploy can fail. A written rollback plan — previous image tag, migration down-steps, who decides — turns a 2 AM panic into a 5-minute routine.' },
    { q: 'Kya meri checklist progress save hoti hai?',
      a: 'Yes — press "Save progress" and it is stored encrypted-optional in this device\'s vault. Nothing leaves your browser.' }
  ]);
  SEO.softwareApp({
    name: 'Deployment Checklist — Free Pre/Post Deploy QA',
    description: 'Free interactive deployment checklist: pre-deploy, during-deploy and post-deploy steps with progress %, custom items, vault save, export & print.',
    keywords: ['deployment checklist', 'deploy checklist', 'production deployment checklist', 'pre deploy checklist', 'post deployment verification']
  });

  var state = defaultChecklist();
  var dirty = false;

  function render() {
    var box = el('dcl-sections');
    box.innerHTML = state.map(function (s, si) {
      return '<section class="dsec"><h2 class="vq-section-sub">' + esc(s.title) + '</h2>' +
        s.items.map(function (it, ii) {
          return '<label class="ditem' + (it.done ? ' done' : '') + '">' +
            '<input type="checkbox" data-s="' + si + '" data-i="' + ii + '"' + (it.done ? ' checked' : '') + '>' +
            '<span>' + esc(it.text) + '</span></label>';
        }).join('') +
        '<div class="addrow"><input type="text" placeholder="Add custom item…" aria-label="Add custom item to ' + esc(s.title) + '" data-add="' + si + '">' +
        '<button class="vq-btn ghost sm" data-addbtn="' + si + '">Add</button></div></section>';
    }).join('');

    box.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state[+cb.getAttribute('data-s')].items[+cb.getAttribute('data-i')].done = cb.checked;
        dirty = true;
        render();
      });
    });
    box.querySelectorAll('[data-addbtn]').forEach(function (b) {
      b.addEventListener('click', function () { addCustom(+b.getAttribute('data-addbtn')); });
    });
    box.querySelectorAll('[data-add]').forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); addCustom(+inp.getAttribute('data-add')); }
      });
    });

    var p = checklistProgress(state);
    el('dcl-pct').textContent = p.pct + '%';
    el('dcl-bar').style.width = p.pct + '%';
    el('dcl-count').textContent = p.done + ' of ' + p.total + ' done' + (dirty ? ' · unsaved changes' : '');
  }

  function addCustom(si) {
    var inp = document.querySelector('[data-add="' + si + '"]');
    var t = inp.value.trim();
    if (!t) return;
    state[si].items.push({ id: 'c' + Date.now(), text: t, done: false, custom: true });
    dirty = true;
    render();
  }

  async function saveProgress() {
    var msg = el('dcl-msg');
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('dcl-upsell'), SLUG, SAVE_LIMIT); return; }
    el('dcl-upsell').innerHTML = '';
    try {
      await Vault.save(SLUG, 'checklist-state', { savedAt: new Date().toISOString(), sections: state });
      dirty = false;
      render();
      msg.textContent = 'Progress saved on this device (' + gate.remaining + ' saves left today).';
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function loadProgress() {
    try {
      var d = await Vault.load(SLUG, 'checklist-state');
      if (d && d.sections && d.sections.length) {
        state = d.sections;
        dirty = false;
        el('dcl-msg').textContent = 'Loaded saved progress from ' + new Date(d.savedAt).toLocaleString('en-IN') + '.';
      }
    } catch (e) {
      if (String(e.message).indexOf('passphrase') >= 0) {
        el('dcl-msg').textContent = 'Saved checklist is encrypted — set the vault passphrase to load it.';
      }
    }
    render();
  }

  async function setPassphrase() {
    var msg = el('dcl-msg');
    var pp = el('dcl-pass').value;
    if (!pp) { Vault.clearPassphrase(); msg.textContent = 'Passphrase cleared — saving unencrypted.'; return; }
    try {
      await Vault.setPassphrase(pp);
      msg.textContent = 'Passphrase set — saves will be encrypted on this device.';
    } catch (e) {
      msg.textContent = 'Encryption unavailable here (' + e.message + ') — saving unencrypted.';
    }
  }

  function downloadMd() {
    var md = checklistMarkdown(state, 'Deployment Checklist — ' + new Date().toLocaleDateString('en-IN'));
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deployment-checklist.md';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('dcl-msg').textContent = 'Checklist exported as Markdown.';
  }

  function resetAll() {
    if (!confirm('Reset all checkboxes to the default checklist? Custom items will be removed.')) return;
    state = defaultChecklist();
    dirty = true;
    render();
  }

  el('saveBtn').addEventListener('click', saveProgress);
  el('dlBtn').addEventListener('click', downloadMd);
  el('printBtn').addEventListener('click', function () { window.print(); });
  el('resetBtn').addEventListener('click', resetAll);
  el('ppBtn').addEventListener('click', setPassphrase);
  loadProgress();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dclInit);
  } else { dclInit(); }
}
