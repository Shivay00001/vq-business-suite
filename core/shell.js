/* ============================================================
   VisionQuantech Business Suite — shared shell
   Injects header/nav/footer, sets active nav, language-toggle stub.
   Include on every page: <script src="../../core/shell.js"></script>
   (root pages use "core/shell.js"). No dependencies.
   ============================================================ */
(function () {
  'use strict';

  /* Root-relative helper: "." at suite root, "../.." inside apps/<slug>/ */
  function computeRoot() {
    var p = String(window.location.pathname || '').replace(/\\/g, '/');
    return (/\/apps\/[^/]+\//.test(p) || /\/apps\/[^/]+$/.test(p)) ? '../..' : '.';
  }
  var ROOT = computeRoot();

  var NAV = [
    { href: ROOT + '/index.html',   label: 'Home',     key: 'home' },
    { href: ROOT + '/pricing.html', label: 'Pricing',  key: 'pricing' },
    { href: ROOT + '/api.html',     label: 'API Docs', key: 'api' }
  ];

  function activeKey() {
    var fromBody = document.body && document.body.getAttribute('data-nav');
    if (fromBody) return fromBody;
    var p = String(window.location.pathname || '');
    if (/pricing\.html/.test(p)) return 'pricing';
    if (/api\.html/.test(p)) return 'api';
    return 'home';
  }

  function headerHTML(key) {
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.key === key ? ' class="active"' : '') + '>' +
             n.label + '</a>';
    }).join('');
    return '' +
      '<div class="vq-header-inner">' +
        '<a class="vq-brand" href="' + ROOT + '/index.html">' +
          '<img src="' + ROOT + '/assets/logo.svg" alt="VisionQuantech logo" width="30" height="30">' +
          '<span>VisionQuantech<small>Business Suite</small></span>' +
        '</a>' +
        '<nav class="vq-nav" aria-label="Primary">' + links +
          '<span class="vq-lang" role="group" aria-label="Language">' +
            '<button type="button" data-lang="en">EN</button>' +
            '<button type="button" data-lang="hi">हिं</button>' +
          '</span>' +
        '</nav>' +
      '</div>';
  }

  function footerHTML() {
    var year = new Date().getFullYear();
    return '' +
      '<div class="vq-footer-inner">' +
        '<div><strong>VisionQuantech Business Suite</strong>' +
          'Free business tools for Indian SMEs — GST, invoicing, HR, loans, ' +
          'cash flow and more. Everything runs 100% in your browser; ' +
          'your data never leaves your device.</div>' +
        '<div><strong>Suite</strong>' +
          '<a href="' + ROOT + '/index.html">All tools</a>' +
          '<a href="' + ROOT + '/pricing.html">Pricing</a>' +
          '<a href="' + ROOT + '/api.html">API docs</a></div>' +
        '<div><strong>Company</strong>' +
          '<a href="https://visionquantech.com" rel="noopener">visionquantech.com</a></div>' +
      '</div>' +
      '<div class="vq-footnote">© ' + year + ' VisionQuantech. ' +
      'Tools are provided as-is for general business use and are not ' +
      'professional tax, legal or financial advice. Verify figures with a qualified professional.</div>';
  }

  /* ---- language toggle stub (EN/HI) ----
     Persists choice, sets <html lang>, and fires "vqs:langchange".
     Apps that ship Hindi copy listen for the event and swap their own strings. */
  function currentLang() {
    try { return localStorage.getItem('vqs:lang') || 'en'; } catch (e) { return 'en'; }
  }
  function setLang(lang) {
    lang = (lang === 'hi') ? 'hi' : 'en';
    try { localStorage.setItem('vqs:lang', lang); } catch (e) {}
    document.documentElement.setAttribute('lang', lang);
    document.querySelectorAll('.vq-lang button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === lang);
    });
    window.dispatchEvent(new CustomEvent('vqs:langchange', { detail: { lang: lang } }));
  }

  function mount() {
    var key = activeKey();

    var header = document.getElementById('vq-header');
    if (header) {
      header.className = 'vq-header';
      header.innerHTML = headerHTML(key);
    } else {
      var h = document.createElement('header');
      h.className = 'vq-header';
      h.innerHTML = headerHTML(key);
      document.body.insertBefore(h, document.body.firstChild);
    }

    var footer = document.getElementById('vq-footer');
    if (footer) {
      footer.className = 'vq-footer';
      footer.innerHTML = footerHTML();
    } else {
      var f = document.createElement('footer');
      f.className = 'vq-footer';
      f.innerHTML = footerHTML();
      document.body.appendChild(f);
    }

    document.documentElement.setAttribute('lang', currentLang());
    document.querySelectorAll('.vq-lang button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === currentLang());
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });
  }

  /* Public namespace used by other core modules */
  window.VQ = window.VQ || {};
  window.VQ.root = ROOT;
  window.VQ.pricingURL = function () { return ROOT + '/pricing.html'; };
  window.VQ.setLang = setLang;
  window.VQ.lang = currentLang;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
