/* ============================================================
   VisionQuantech Business Suite — Compliance Gap Identifier
   apps/compliance-gap-identifier/app.js

   Self-assessment tool: pick your entity type and size; the tool
   works out which Indian statutory compliances likely apply
   (GST, PF, ESI, Shops & Establishments, Professional Tax, Udyam,
   TAN/TDS, trade licence) with indicative due dates. Tick what you
   are already compliant with -> gap list.

   Thresholds are simplified guides, not legal definitions —
   confirm with your CA. Due dates are indicative.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var ENTITIES = ['proprietorship', 'partnership', 'llp', 'private-ltd', 'opc'];
  var ENTITY_LABELS = {
    'proprietorship': 'Proprietorship', 'partnership': 'Partnership firm',
    'llp': 'LLP', 'private-ltd': 'Private Limited', 'opc': 'One Person Company'
  };

  var STATUTES = [
    {
      id: 'gst', name: 'GST registration & returns',
      applies: function (p) { return p.turnoverLakh >= 40; },
      why: 'Turnover at/above ~₹40 lakh (goods; ~₹20 lakh for services in most states — simplified here)',
      due: 'GSTR-1 by 11th, GSTR-3B by 20th of next month (monthly filers)',
      checkNote: ''
    },
    {
      id: 'shops', name: 'Shops & Establishments Act registration',
      applies: function (p) { return p.employees >= 1; },
      why: 'Any establishment with employees (state-specific rules)',
      due: 'Registration within 30 days of starting; renewal yearly (varies by state)',
      checkNote: ''
    },
    {
      id: 'pf', name: 'EPF (Provident Fund)',
      applies: function (p) { return p.employees >= 20; },
      why: '20+ employees on rolls',
      due: 'ECR + payment by 15th of next month',
      checkNote: ''
    },
    {
      id: 'esi', name: 'ESI (Employees’ State Insurance)',
      applies: function (p) { return p.employees >= 10; },
      why: '10+ employees in ESI-implemented areas (simplified)',
      due: 'Contribution by 15th of next month',
      checkNote: ''
    },
    {
      id: 'pt', name: 'Professional Tax',
      applies: function (p) { return p.employees >= 1; },
      why: 'Applies in many states (rates & slabs vary by state)',
      due: 'Monthly/annual per state slab — check your state',
      checkNote: 'State-specific — verify for your state'
    },
    {
      id: 'tan', name: 'TAN & TDS compliance',
      applies: function (p) { return p.employees >= 1 || p.turnoverLakh >= 50; },
      why: 'Salary payments or payments above TDS thresholds',
      due: 'TDS payment by 7th of next month; returns 24Q/26Q quarterly',
      checkNote: ''
    },
    {
      id: 'udyam', name: 'Udyam (MSME) registration',
      applies: function (p) { return p.turnoverLakh < 500; },
      why: 'Optional but useful for MSME benefits, tenders & cheaper credit',
      due: 'One-time, free on udyamregistration.gov.in',
      checkNote: 'Optional — recommended'
    },
    {
      id: 'trade', name: 'Trade / Gumasta licence',
      applies: function (p) { return p.hasPremises; },
      why: 'Physical shop/office premises (municipal requirement)',
      due: 'Yearly renewal (municipality-specific)',
      checkNote: 'Check your municipality'
    },
    {
      id: 'roc', name: 'ROC annual filings (AOC-4, MGT-7)',
      applies: function (p) { return p.entity === 'private-ltd' || p.entity === 'opc' || p.entity === 'llp'; },
      why: 'Companies & LLPs must file annually with the Registrar',
      due: 'AOC-4 within 30 days of AGM; MGT-7 within 60 days (LLP: Form 11 by 30 May, Form 8 by 30 Oct)',
      checkNote: ''
    }
  ];

  function statuteIds() { return STATUTES.map(function (s) { return s.id; }); }

  function validateProfile(entity, employees, turnoverLakh, hasPremises) {
    if (ENTITIES.indexOf(entity) === -1) return { ok: false, error: 'Choose an entity type.' };
    var e = Number(employees);
    if (!isFinite(e) || Math.floor(e) !== e || e < 0 || e > 100000)
      return { ok: false, error: 'Employees must be a whole number between 0 and 100000.' };
    var t = Number(turnoverLakh);
    if (!isFinite(t) || t < 0 || t > 10000000)
      return { ok: false, error: 'Turnover must be a number between 0 and 1,00,00,000 (₹ lakh).' };
    return { ok: true, profile: { entity: entity, employees: e, turnoverLakh: t, hasPremises: !!hasPremises } };
  }

  /** Statutes that likely apply to the profile, with reasons + indicative dues. */
  function applicableStatutes(profile) {
    if (!profile || typeof profile !== 'object') return [];
    return STATUTES.filter(function (s) {
      try { return !!s.applies(profile); } catch (e) { return false; }
    }).map(function (s) {
      return { id: s.id, name: s.name, why: s.why, due: s.due, checkNote: s.checkNote };
    });
  }

  /**
   * evaluate(profile, compliantIds) -> {ok, applicable[], gaps[], compliantCount, coverage}
   * gaps = applicable statutes not ticked as compliant.
   */
  function evaluate(profile, compliantIds) {
    if (!Array.isArray(compliantIds)) return { ok: false, error: 'Internal error: compliant list must be an array.' };
    var seen = {}, unknown = [];
    compliantIds.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      if (statuteIds().indexOf(id) === -1) unknown.push(id);
    });
    if (unknown.length) return { ok: false, error: 'Unknown statute id(s): ' + unknown.join(', ') };
    var applicable = applicableStatutes(profile);
    var gaps = applicable.filter(function (s) { return !seen[s.id]; });
    var coverage = applicable.length ? Math.round(((applicable.length - gaps.length) / applicable.length) * 100) : 100;
    return {
      ok: true, applicable: applicable, gaps: gaps,
      compliantCount: applicable.length - gaps.length, total: applicable.length, coverage: coverage
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    ENTITIES: ENTITIES, ENTITY_LABELS: ENTITY_LABELS, STATUTES: STATUTES,
    statuteIds: statuteIds, validateProfile: validateProfile,
    applicableStatutes: applicableStatutes, evaluate: evaluate, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'compliance-gap-identifier';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('cgi-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderChecklist(applicable) {
    var html = '';
    applicable.forEach(function (s) {
      html += '<div class="check-row"><input type="checkbox" id="cgi-' + s.id + '" value="' + s.id + '">' +
        '<label for="cgi-' + s.id + '" style="margin:0"><strong>' + esc(s.name) + '</strong><br>' +
        '<span class="vq-hint">' + esc(s.why) + ' · Due: ' + esc(s.due) +
        (s.checkNote ? ' · ' + esc(s.checkNote) : '') + '</span></label></div>';
    });
    $('cgi-list').innerHTML = html || '<p class="vq-hint">No statutes matched this profile — double-check your inputs.</p>';
    $('cgi-list-card').hidden = !applicable.length;
  }

  function renderResult(r) {
    var html = '<p>Compliance coverage: <span class="big">' + r.coverage + '%</span> ' +
      '<span class="chip ' + (r.coverage >= 80 ? 'b-low' : r.coverage >= 50 ? 'b-med' : 'b-high') + '">' +
      r.compliantCount + '/' + r.total + ' covered</span></p>';
    if (r.gaps.length) {
      html += '<h3 class="vq-section-title">Gap list — likely applicable, not yet compliant</h3><ul class="gaps">';
      r.gaps.forEach(function (g) {
        html += '<li><strong>' + esc(g.name) + '</strong><br><span class="vq-hint">Why it applies: ' + esc(g.why) +
          ' · Indicative due: ' + esc(g.due) + (g.checkNote ? ' · ' + esc(g.checkNote) : '') + '</span></li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">No gaps found for this profile — recheck whenever headcount or turnover crosses a threshold.</p>';
    }
    html += '<p class="vq-hint">Thresholds simplified; due dates indicative — <strong>confirm with your CA</strong> before registering or filing.</p>';
    $('cgi-result').innerHTML = html;
    $('cgi-result-card').hidden = false;
    $('cgi-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'compliance-gap-identifier-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'compliance-gap-identifier-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a compliance gap identifier?', a: 'You enter your entity type, headcount and turnover; the tool lists the Indian statutory compliances that likely apply (GST, PF, ESI, Shops Act, Professional Tax, Udyam, TAN, ROC filings) with indicative due dates. You tick what you already do — it returns the gap list.' },
      { q: 'अनुपालन अंतर पहचानकर्ता क्या है?', a: 'अपनी इकाई का प्रकार, कर्मचारी संख्या और टर्नओवर दर्ज करें — लागू होने वाले वैधानिक अनुपालनों (GST, PF, ESI आदि) की सूची और कमी की सूची पाएं।' },
      { q: 'When does GST registration become mandatory?', a: 'Broadly at ~₹40 lakh turnover for goods (~₹20 lakh for services in most states). Inter-state supply or e-commerce can trigger it earlier. Thresholds are simplified here — confirm with your CA.' },
      { q: 'When do PF and ESI apply?', a: 'EPF broadly at 20+ employees; ESI at 10+ employees in implemented areas. Both need monthly contributions by the 15th.' },
      { q: 'Is this legal advice?', a: 'No. Thresholds are simplified guides and due dates are indicative. Confirm with your CA before registering, filing or paying.' }
    ]);

    $('cgi-profile').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('cgi-gate'), SLUG, FREE_LIMIT); $('cgi-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var v = validateProfile($('cgi-entity').value, $('cgi-emp').value, $('cgi-turn').value, $('cgi-prem').checked);
      if (!v.ok) { msg(v.error, false); return; }
      window._cgiProfile = v.profile;
      var applicable = applicableStatutes(v.profile);
      msg(applicable.length + ' statute(s) likely apply to this profile. Tick the ones you are already compliant with.', true);
      renderChecklist(applicable);
      $('cgi-result-card').hidden = true;
    });

    $('cgi-calc').addEventListener('click', function () {
      var profile = window._cgiProfile;
      if (!profile) { msg('Generate your applicable list first.', false); return; }
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('cgi-gate'), SLUG, FREE_LIMIT); $('cgi-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var applicable = applicableStatutes(profile);
      var compliant = [];
      applicable.forEach(function (s) { if ($('cgi-' + s.id) && $('cgi-' + s.id).checked) compliant.push(s.id); });
      var r = evaluate(profile, compliant);
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._cgiLast = r;
    });

    $('cgi-save').addEventListener('click', async function () {
      var r = window._cgiLast;
      if (!r) { msg('Run the gap check first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('cgi-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'gaps-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), profile: window._cgiProfile,
          coverage: r.coverage, compliantCount: r.compliantCount, total: r.total, gaps: r.gaps
        });
        msg('Gap report saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
