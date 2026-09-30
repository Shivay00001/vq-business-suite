/* ============================================================
   VisionQuantech Business Suite — Payment Follow-up Letter Tool
   apps/payment-followup-letter-tool/app.js

   Pure functions first (no DOM) — tested under node.
   30/60/90-day follow-up letter sequence for overdue invoices:
   computes days overdue, picks the stage, drafts the letter.
   DRAFTS only — not legal advice.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var STAGE_DEFS = {
    'first-reminder': { minDays: 0, label: 'First reminder (1–29 days overdue)',
      tone: 'Gentle nudge — invoice may have been missed.' },
    '30-day': { minDays: 30, label: '30-day follow-up (30–59 days overdue)',
      tone: 'Firm reminder — request payment within 7 days.' },
    '60-day': { minDays: 60, label: '60-day escalation (60–89 days overdue)',
      tone: 'Serious — warn of paused supplies and late charges.' },
    '90-day': { minDays: 90, label: '90-day final notice (90+ days overdue)',
      tone: 'Final — matter will be referred for legal recovery.' }
  };

  function validateText(v, label, maxLen) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: label + ' is required.' };
    if (s.length > (maxLen || 300)) return { ok: false, error: label + ' is too long.' };
    return { ok: true, value: s };
  }

  function validateAmount(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return { ok: false, error: 'Enter a valid overdue amount greater than zero.' };
    if (n > 1000000000) return { ok: false, error: 'Amount looks too large.' };
    return { ok: true, value: n };
  }

  function validateDate(v, label) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: label + ' must be YYYY-MM-DD.' };
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
      return { ok: false, error: label + ' is not a real date.' };
    return { ok: true, value: s };
  }

  function daysOverdue(dueDate, todayStr) {
    var dd = validateDate(dueDate, 'Due date');
    if (!dd.ok) return dd;
    var t = todayStr ? validateDate(todayStr, 'Today') : { ok: true, value: new Date().toISOString().slice(0, 10) };
    if (!t.ok) return t;
    var d1 = new Date(dd.value + 'T00:00:00'), d2 = new Date(t.value + 'T00:00:00');
    return { ok: true, value: Math.round((d2 - d1) / 86400000) };
  }

  /** Stage from days overdue (0-29 first-reminder, 30-59 30-day, 60-89 60-day, 90+ 90-day). */
  function stageForDays(days) {
    var n = Number(days);
    if (!isFinite(n)) return { ok: false, error: 'Days must be a number.' };
    if (n >= 90) return { ok: true, value: '90-day' };
    if (n >= 60) return { ok: true, value: '60-day' };
    if (n >= 30) return { ok: true, value: '30-day' };
    return { ok: true, value: 'first-reminder' };
  }

  function validateLetter(data) {
    var d = data || {};
    var cust = validateText(d.customerName, 'Customer name'); if (!cust.ok) return cust;
    var inv = validateText(d.invoiceNo, 'Invoice number', 100); if (!inv.ok) return inv;
    var amt = validateAmount(d.amount); if (!amt.ok) return amt;
    var due = validateDate(d.dueDate, 'Due date'); if (!due.ok) return due;
    var biz = validateText(d.businessName, 'Your business name', 200); if (!biz.ok) return biz;
    var from = validateText(d.fromName, 'Your name'); if (!from.ok) return from;
    var od = daysOverdue(due.value, d.todayStr);
    if (!od.ok) return od;
    if (od.value < 0) return { ok: false, error: 'Due date is in the future — nothing is overdue yet.' };
    var st = stageForDays(od.value);
    return { ok: true, value: { customerName: cust.value, invoiceNo: inv.value,
      amount: amt.value, dueDate: due.value, businessName: biz.value,
      fromName: from.value, daysOverdue: od.value, stage: st.value } };
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function letterBody(v) {
    var amt = fmtINR(v.amount);
    var L = ['Subject: ' + STAGE_DEFS[v.stage].label + ' — Invoice ' + v.invoiceNo + ' (' + amt + ')', '', 'Dear ' + v.customerName + ',', ''];
    if (v.stage === 'first-reminder') {
      L.push('A quick reminder that Invoice ' + v.invoiceNo + ' for ' + amt +
        ' (due ' + v.dueDate + ', ' + v.daysOverdue + ' day(s) overdue) is awaiting payment.');
      L.push('');
      L.push('Please arrange payment this week, or share the UTR if already paid. If there is any query on the invoice, reply to this letter so we can resolve it quickly.');
    } else if (v.stage === '30-day') {
      L.push('Invoice ' + v.invoiceNo + ' for ' + amt + ' is now ' + v.daysOverdue +
        ' days overdue (due ' + v.dueDate + ').');
      L.push('');
      L.push('Please clear this within 7 days. If the invoice is disputed, raise it in writing within 3 days — otherwise we will treat the amount as admitted and due.');
    } else if (v.stage === '60-day') {
      L.push('Invoice ' + v.invoiceNo + ' for ' + amt + ' is now ' + v.daysOverdue +
        ' days overdue (due ' + v.dueDate + '). This is a serious escalation.');
      L.push('');
      L.push('We are pausing further supplies/services until this is cleared, and late-payment charges per our terms now apply. Pay within 7 days to avoid the account being marked for recovery.');
    } else {
      L.push('FINAL NOTICE: Invoice ' + v.invoiceNo + ' for ' + amt + ' is ' + v.daysOverdue +
        ' days overdue (due ' + v.dueDate + ').');
      L.push('');
      L.push('Pay within 7 days, failing which the matter will be referred to our counsel for legal recovery, with all costs claimed from you. Have a lawyer review this stage before sending.');
    }
    L.push('');
    L.push('Regards,');
    L.push(v.fromName + ', ' + v.businessName);
    L.push('');
    L.push('---');
    L.push('DRAFT ONLY — not legal advice.');
    return L.join('\n');
  }

  /** Preview of the whole 30/60/90 sequence for one invoice (labels only). */
  function sequencePreview() {
    return Object.keys(STAGE_DEFS).map(function (k) {
      return { stage: k, label: STAGE_DEFS[k].label, tone: STAGE_DEFS[k].tone };
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    STAGE_DEFS: STAGE_DEFS,
    validateLetter: validateLetter, letterBody: letterBody,
    daysOverdue: daysOverdue, stageForDays: stageForDays,
    sequencePreview: sequencePreview, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'payment-followup-letter-tool';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('f-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(v, text) {
    var card = $('f-result-card');
    card.hidden = false;
    var seq = sequencePreview().map(function (s) {
      return '<li' + (s.stage === v.stage ? ' class="cur"' : '') + '><strong>' + esc(s.label) + '</strong> — ' + esc(s.tone) + '</li>';
    }).join('');
    $('f-result').innerHTML =
      '<p>Days overdue: <strong>' + v.daysOverdue + '</strong> → stage: <strong>' + esc(STAGE_DEFS[v.stage].label) + '</strong></p>' +
      '<pre class="notice">' + esc(text) + '</pre>' +
      '<button id="f-copy" class="vq-btn" type="button">Copy letter</button>' +
      '<h3>Full 30/60/90 sequence</h3><ol class="assump" style="list-style:decimal inside">' + seq + '</ol>';
    $('f-copy').addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      msg('Letter copied.', true);
    });
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'payment-followup-letter-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'payment-followup-letter-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the 30/60/90-day payment follow-up sequence?', a: 'First reminder at 1–29 days overdue, firm follow-up at 30–59, escalation at 60–89, and a final notice at 90+. This tool picks the right stage from the due date and drafts the letter.' },
      { q: 'पेमेंट फॉलो-अप लेटर कैसे लिखें?', a: 'देय तिथि से दिनों की गिनती करें — 30/60/90 दिन पर टोन बढ़ाएं। यह टूल सही चरण चुनकर पत्र का ड्राफ्ट तैयार करता है।' },
      { q: 'When should I stop following up and take legal action?', a: 'After the 90-day final notice goes unanswered, most businesses hand the matter to counsel. A lawyer should review the final notice first.' },
      { q: 'Should the tone differ between stages?', a: 'Yes — start helpful (it may be an oversight), get firm at 30 days, escalate consequences at 60, and make the 90-day letter the final warning.' },
      { q: 'Is this legal advice?', a: 'No — these are drafts, not legal advice. Consult a lawyer for recovery action.' }
    ]);
    $('f-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('f-gate'), SLUG, FREE_LIMIT); $('f-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = validateLetter({
        customerName: $('f-cust').value, invoiceNo: $('f-inv').value,
        amount: $('f-amount').value, dueDate: $('f-due').value,
        businessName: $('f-biz').value, fromName: $('f-from').value
      });
      if (!r.ok) { msg(r.error, false); $('f-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r.value, letterBody(r.value));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
