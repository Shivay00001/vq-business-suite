/* ============================================================
   VisionQuantech Business Suite — Plain Language Summary Generator
   apps/plain-language-summary-generator/app.js

   Pure functions first (no DOM) — tested under node.
   Paste jargon-heavy text (a notice, an audit paragraph):
   extracts key numbers (amounts, %, days, dates) and produces
   a plain-language bullet summary of the important sentences.
   A comprehension aid — NOT legal/financial advice.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_CHARS = 20000;
  var MAX_BULLETS = 6;

  var SIGNAL_WORDS = [
    'penalty', 'late fee', 'interest', 'payable', 'pay', 'payment', 'due',
    'within', 'notice', 'default', 'shall', 'must', 'required', 'liable',
    'liability', 'per day', 'overdue', 'demand', 'recover', 'consequence',
    'fail', 'failure', 'breach', 'violat', 'deadline', 'furnish', 'file',
    'filing', 'deposit', 'remit'
  ];

  var JARGON_MAP = [
    [/hereinafter/gi, 'from here on'], [/notwithstanding/gi, 'despite'],
    [/pursuant to/gi, 'under'], [/in pursuance of/gi, 'under'],
    [/aforesaid/gi, 'mentioned above'], [/hereby/gi, 'by this'],
    [/thereof/gi, 'of it'], [/therein/gi, 'in it'],
    [/whereas/gi, 'since'], [/henceforth/gi, 'from now on']
  ];

  function validateText(v) {
    var s = String(v == null ? '' : v);
    if (!s.trim()) return { ok: false, error: 'Paste some text to summarise.' };
    if (s.length > MAX_CHARS)
      return { ok: false, error: 'Text is too long (max ' + MAX_CHARS + ' characters). Paste the key paragraph instead.' };
    return { ok: true, value: s };
  }

  function dedupe(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }

  /** Extract key numbers: amounts, percentages, day-counts, dates. */
  function extractNumbers(text) {
    var t = String(text || '');
    var amounts = dedupe(
      (t.match(/(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d{1,2})?/gi) || [])
        .concat(t.match(/[\d,]+\s?(?:lakh|lac|crore)/gi) || [])
    );
    var percents = dedupe(t.match(/\d+(?:\.\d+)?\s?%/g) || []);
    var days = dedupe(t.match(/\d+\s?days?/gi) || []);
    var dates = dedupe(
      (t.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g) || [])
        .concat(t.match(/\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s*\d{4}/gi) || [])
    );
    return { amounts: amounts, percents: percents, days: days, dates: dates };
  }

  function simplifySentence(s) {
    var out = s;
    JARGON_MAP.forEach(function (pair) { out = out.replace(pair[0], pair[1]); });
    return out.replace(/\s+/g, ' ').trim();
  }

  function sentenceScore(s) {
    var low = s.toLowerCase();
    var score = 0;
    SIGNAL_WORDS.forEach(function (w) { if (low.indexOf(w) !== -1) score += 1; });
    if (/₹|Rs\.?|INR|\d+%|\d+\s?days?/i.test(s)) score += 2;
    if (s.length > 400) score -= 1;
    return score;
  }

  /** Produce bullets + key numbers. */
  function summarize(text) {
    var v = validateText(text);
    if (!v.ok) return v;
    var t = v.value;
    var keyNumbers = extractNumbers(t);
    var sentences = t.replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z0-9₹"“])/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 20; });
    if (!sentences.length) sentences = [t.trim()];
    var scored = sentences.map(function (s, i) { return { s: s, i: i, score: sentenceScore(s) }; });
    scored.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    var picked = scored.filter(function (x) { return x.score > 0; }).slice(0, MAX_BULLETS);
    if (!picked.length) picked = scored.slice(0, Math.min(3, scored.length));
    picked.sort(function (a, b) { return a.i - b.i; });
    var bullets = picked.map(function (x) { return simplifySentence(x.s); });
    return {
      ok: true,
      bullets: bullets,
      keyNumbers: keyNumbers,
      wordCount: t.trim().split(/\s+/).length,
      disclaimer: 'Comprehension aid only — this simplifies wording, it does not interpret law or give advice. For a notice or audit para, consult your CA/lawyer.'
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_CHARS: MAX_CHARS,
    validateText: validateText, extractNumbers: extractNumbers,
    summarize: summarize, simplifySentence: simplifySentence,
    esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'plain-language-summary-generator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('s-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r) {
    var card = $('s-result-card');
    card.hidden = false;
    var bullets = r.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('');
    function chipRow(label, arr) {
      if (!arr.length) return '';
      return '<p><strong>' + esc(label) + ':</strong> ' +
        arr.map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join(' ') + '</p>';
    }
    var kn = r.keyNumbers;
    $('s-result').innerHTML =
      '<h3>In plain language</h3><ul class="assump">' + bullets + '</ul>' +
      '<h3>Key numbers spotted</h3>' +
      chipRow('Amounts', kn.amounts) + chipRow('Percentages', kn.percents) +
      chipRow('Day counts', kn.days) + chipRow('Dates', kn.dates) +
      '<p class="vq-hint">' + esc(r.disclaimer) + '</p>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'plain-language-summary-generator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'plain-language-summary-generator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What does this plain-language tool do?', a: 'Paste a jargon-heavy paragraph — a tax notice, an audit note — and it pulls out the key numbers (amounts, rates, deadlines) and rewrites the important sentences in plain words.' },
      { q: 'कठिन कानूनी भाषा को आसान कैसे समझें?', a: 'पैराग्राफ पेस्ट करें — टूल मुख्य रकम, दरें और समय-सीमा निकालकर ज़रूरी बातों को सरल भाषा में बुलेट पॉइंट में देता है।' },
      { q: 'Does it interpret the law for me?', a: 'No. It simplifies wording and surfaces numbers; it does not interpret legal meaning or give advice. A CA or lawyer must interpret notices.' },
      { q: 'What text works best?', a: 'One focused paragraph (a notice, an audit observation, a clause). Very long documents should be pasted one key section at a time.' },
      { q: 'Is my pasted text stored anywhere?', a: 'No — everything is processed in your browser and nothing is uploaded or saved.' }
    ]);
    $('s-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); $('s-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = summarize($('s-text').value);
      if (!r.ok) { msg(r.error, false); $('s-result-card').hidden = true; return; }
      msg(r.wordCount + ' words processed.', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
