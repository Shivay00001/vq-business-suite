/* ============================================================
   VisionQuantech Business Suite — Demand Letter Generator
   apps/demand-letter-generator/app.js

   Pure functions first (no DOM) — tested under node.
   Polite → firm escalation drafts (English + Hindi) for overdue
   payments. DRAFTS only — not legal advice, not filed documents.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var STAGES = ['polite', 'firm', 'final'];

  var TONE = {
    polite: { en: 'Gentle reminder', hi: 'विनम्र अनुस्मारक',
      enBody: 'This is a friendly reminder',
      firmness: 'We wanted to bring to your attention that' },
    firm: { en: 'Firm notice', hi: 'कड़ा नोटिस',
      enBody: 'Despite our earlier reminder',
      firmness: 'We must now insist that' },
    final: { en: 'Final demand before legal action', hi: 'कानूनी कार्रवाई से पहले अंतिम मांग',
      enBody: 'This is our final communication before legal action',
      firmness: 'Unless payment is received, we will be compelled to' }
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

  function validateStage(v) {
    if (STAGES.indexOf(v) === -1)
      return { ok: false, error: 'Stage must be polite, firm or final.' };
    return { ok: true, value: v };
  }

  function validateDate(v, label) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: label + ' must be YYYY-MM-DD.' };
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
      return { ok: false, error: label + ' is not a real date.' };
    return { ok: true, value: s };
  }

  function validateLetter(data) {
    var d = data || {};
    var s = validateStage(d.stage); if (!s.ok) return s;
    var from = validateText(d.fromName, 'Your name'); if (!from.ok) return from;
    var to = validateText(d.toName, 'Customer name'); if (!to.ok) return to;
    var amt = validateAmount(d.amount); if (!amt.ok) return amt;
    var inv = validateText(d.invoiceNo, 'Invoice number', 100); if (!inv.ok) return inv;
    var dd = validateDate(d.dueDate, 'Due date'); if (!dd.ok) return dd;
    var lang = d.lang === 'hi' ? 'hi' : 'en';
    var biz = validateText(d.businessName, 'Your business name', 200); if (!biz.ok) return biz;
    return { ok: true, value: { stage: s.value, fromName: from.value, toName: to.value,
      amount: amt.value, invoiceNo: inv.value, dueDate: dd.value, lang: lang, businessName: biz.value } };
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /** Build the letter text. Stage drives tone; lang picks English/Hindi. */
  function letterText(v) {
    var amt = fmtINR(v.amount);
    if (v.lang === 'hi') return letterTextHi(v, amt);
    var head = 'Subject: ' + TONE[v.stage].en + ' — overdue payment of ' + amt + ' (Invoice ' + v.invoiceNo + ')';
    var L = [head, '', 'Dear ' + v.toName + ',', ''];
    if (v.stage === 'polite') {
      L.push('I hope you are well. This is a gentle reminder that Invoice ' + v.invoiceNo +
        ' for ' + amt + ', due on ' + v.dueDate + ', is still outstanding.');
      L.push('');
      L.push('It may simply have slipped through — please arrange payment at your earliest convenience, or let us know if there is any query on the invoice.');
    } else if (v.stage === 'firm') {
      L.push('Despite our earlier reminder, Invoice ' + v.invoiceNo + ' for ' + amt +
        ' (due ' + v.dueDate + ') remains unpaid.');
      L.push('');
      L.push('We value our relationship, but we must now insist on payment within 7 days of this letter. If there is a genuine dispute on the invoice, please raise it in writing within 3 days.');
      L.push('');
      L.push('Continued delay may force us to pause further supplies/services and add late-payment charges as per our terms.');
    } else {
      L.push('This is our FINAL communication before legal action regarding Invoice ' + v.invoiceNo +
        ' for ' + amt + ', due on ' + v.dueDate + ' and unpaid despite repeated reminders.');
      L.push('');
      L.push('Unless the full amount is received within 7 days, we will hand the matter to our counsel for recovery proceedings, and all legal costs will be claimed from you.');
      L.push('');
      L.push('We strongly advise you to treat this as urgent and settle immediately to avoid legal consequences.');
    }
    L.push('');
    L.push('Regards,');
    L.push(v.fromName + ', ' + v.businessName);
    L.push('');
    L.push('---');
    L.push('DRAFT ONLY — not legal advice. Have a lawyer review before sending the "final" stage letter.');
    return L.join('\n');
  }

  function letterTextHi(v, amt) {
    var head = 'विषय: ' + TONE[v.stage].hi + ' — बकाया भुगतान ' + amt + ' (इनवॉइस ' + v.invoiceNo + ')';
    var L = [head, '', 'प्रिय ' + v.toName + ' जी,', ''];
    if (v.stage === 'polite') {
      L.push('आशा है आप कुशल हैं। यह एक विनम्र अनुस्मारक है कि इनवॉइस ' + v.invoiceNo +
        ' की राशि ' + amt + ', जिसकी देय तिथि ' + v.dueDate + ' थी, अभी भी बकाया है।');
      L.push('');
      L.push('हो सकता है यह छूट गया हो — कृपया जल्द से जल्द भुगतान की व्यवस्था करें, या इनवॉइस पर कोई प्रश्न हो तो बताएं।');
    } else if (v.stage === 'firm') {
      L.push('हमारे पहले अनुस्मारक के बावजूद, इनवॉइस ' + v.invoiceNo + ' की राशि ' + amt +
        ' (देय तिथि ' + v.dueDate + ') अभी तक भुगतान नहीं हुई है।');
      L.push('');
      L.push('हम आपके साथ संबंधों को महत्व देते हैं, लेकिन अब हमें इस पत्र के 7 दिनों के भीतर भुगतान की मांग करनी पड़ रही है। यदि इनवॉइस पर कोई वास्तविक विवाद है, तो 3 दिनों के भीतर लिखित में बताएं।');
      L.push('');
      L.push('लगातार देरी पर हमें आगे की सप्लाई/सेवा रोकनी पड़ सकती है और हमारी शर्तों के अनुसार विलंब शुल्क लग सकता है।');
    } else {
      L.push('कानूनी कार्रवाई से पहले यह हमारा अंतिम पत्र है — इनवॉइस ' + v.invoiceNo +
        ' की राशि ' + amt + ', देय तिथि ' + v.dueDate + ', बार-बार के अनुस्मारकों के बावजूद बकाया है।');
      L.push('');
      L.push('यदि 7 दिनों के भीतर पूरी राशि नहीं मिली, तो हम वसूली की कार्रवाई के लिए मामला अपने वकील को सौंप देंगे, और सभी कानूनी खर्च आपसे वसूले जाएंगे।');
      L.push('');
      L.push('कानूनी परिणामों से बचने के लिए तुरंत भुगतान करें।');
    }
    L.push('');
    L.push('सादर,');
    L.push(v.fromName + ', ' + v.businessName);
    L.push('');
    L.push('---');
    L.push('केवल ड्राफ्ट — कानूनी सलाह नहीं। "अंतिम" चरण का पत्र भेजने से पहले वकील से रिव्यू कराएं।');
    return L.join('\n');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    STAGES: STAGES, TONE: TONE,
    validateLetter: validateLetter, letterText: letterText,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'demand-letter-generator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('d-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(text) {
    var card = $('d-result-card');
    card.hidden = false;
    $('d-result').innerHTML =
      '<pre class="notice">' + esc(text) + '</pre>' +
      '<button id="d-copy" class="vq-btn" type="button">Copy letter</button>';
    $('d-copy').addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      msg('Letter copied.', true);
    });
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'demand-letter-generator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'demand-letter-generator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a demand letter for overdue payment?', a: 'A written request for payment that escalates in tone: a polite reminder, then a firm notice, then a final demand before legal action. This tool drafts all three stages in English and Hindi.' },
      { q: 'डिमांड लेटर क्या होता है?', a: 'बकाया भुगतान की लिखित मांग — पहले विनम्र अनुस्मारक, फिर कड़ा नोटिस, फिर कानूनी कार्रवाई से पहले अंतिम मांग। यह टूल तीनों चरण हिंदी और अंग्रेज़ी में तैयार करता है।' },
      { q: 'When should I move from polite to firm?', a: 'Send the polite reminder 3–7 days after the due date, the firm notice at 15–30 days, and the final demand at 45–60 days or per your terms.' },
      { q: 'Can I send the final-stage letter directly?', a: 'You can, but skipping stages weakens your position if it reaches court. A lawyer should review final-stage letters.' },
      { q: 'Is this legal advice?', a: 'No — these are drafts, not legal advice or filed documents. Consult a lawyer for your situation.' }
    ]);
    $('d-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); $('d-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = validateLetter({
        stage: $('d-stage').value, lang: $('d-lang').value,
        fromName: $('d-from').value, businessName: $('d-biz').value,
        toName: $('d-to').value, amount: $('d-amount').value,
        invoiceNo: $('d-inv').value, dueDate: $('d-due').value
      });
      if (!r.ok) { msg(r.error, false); $('d-result-card').hidden = true; return; }
      msg('', null);
      renderResult(letterText(r.value));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
