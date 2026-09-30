/* ============================================================
   Freemium gates for the VisionQuantech Business Suite.
   Per-app, per-day usage counters in localStorage + upsell UI
   linking to the pricing page. Reading saved data is NEVER metered —
   only meter the action (calculate, generate, export).

     var gate = Freemium.check('invoice-generator', 5);
     if (!gate.allowed) { Freemium.renderUpsell(el, 'invoice-generator', 5); return; }
     // ... do the metered work ...

   Suggested free limits: calculators 20/day, generators 5/day.
   ============================================================ */
var Freemium = (function () {
  'use strict';

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function counterKey(app) { return 'vqs:use:' + String(app) + ':' + today(); }

  function readUsed(app) {
    try { return parseInt(localStorage.getItem(counterKey(app)) || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  var api = {};

  /**
   * Check + consume one unit of usage.
   * Returns {allowed, used, limit, remaining}.
   */
  api.check = function (app, limit) {
    limit = Math.max(1, parseInt(limit, 10) || 1);
    var used = readUsed(app);
    if (used >= limit) {
      return { allowed: false, used: used, limit: limit, remaining: 0 };
    }
    try { localStorage.setItem(counterKey(app), String(used + 1)); } catch (e) {}
    return { allowed: true, used: used + 1, limit: limit, remaining: limit - (used + 1) };
  };

  /** Units remaining today without consuming one. */
  api.remaining = function (app, limit) {
    limit = Math.max(1, parseInt(limit, 10) || 1);
    return Math.max(0, limit - readUsed(app));
  };

  function pricingURL() {
    return (window.VQ && window.VQ.pricingURL) ? window.VQ.pricingURL() : 'pricing.html';
  }

  function bannerHTML(app, limit) {
    return '' +
      '<div class="upsell-banner" role="note">' +
        '<div class="u-text">' +
          '<strong>You\'ve used your ' + limit + ' free uses for today.</strong>' +
          '<p>Go Pro (₹299/month) for higher daily limits, no ads, and priority access to new tools.</p>' +
        '</div>' +
        '<a class="vq-btn warn" href="' + pricingURL() + '">See Pro plans</a>' +
      '</div>';
  }

  /** Insert the upsell banner into `el`. */
  api.renderUpsell = function (el, app, limit) {
    if (!el) return;
    el.innerHTML = bannerHTML(app, limit);
  };

  /** Show the upsell as a modal overlay. Returns a close function. */
  api.renderModal = function (app, limit) {
    var veil = document.createElement('div');
    veil.className = 'vq-modal-veil';
    veil.innerHTML = '' +
      '<div class="vq-modal" role="dialog" aria-modal="true">' +
        '<h3>Daily free limit reached</h3>' +
        '<p>You\'ve used your ' + limit + ' free uses of this tool today. ' +
        'Limits reset tomorrow, or go Pro for higher limits and no ads.</p>' +
        '<a class="vq-btn warn" href="' + pricingURL() + '">See Pro — ₹299/month</a>' +
        '<button class="vq-btn ghost" type="button" data-close>Maybe later</button>' +
      '</div>';
    veil.querySelector('[data-close]').addEventListener('click', function () {
      veil.remove();
    });
    veil.addEventListener('click', function (e) {
      if (e.target === veil) veil.remove();
    });
    document.body.appendChild(veil);
    return function () { veil.remove(); };
  };

  return api;
})();
