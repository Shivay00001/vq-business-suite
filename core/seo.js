/* ============================================================
   SEO helpers for the VisionQuantech Business Suite.
   Injects JSON-LD so app pages stay DRY — pages pass plain JS
   objects, this module writes the <script type="application/ld+json">.

     SEO.faq([
       { q: 'Is this GST calculator free?', a: 'Yes — ...' },
     ]);
   ============================================================ */
var SEO = (function () {
  'use strict';

  /** Inject any JSON-LD object into <head>. */
  function jsonld(obj) {
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
    return s;
  }

  /** Inject FAQPage schema from [{q, a}, ...]. */
  function faq(items) {
    return jsonld({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (items || []).map(function (it) {
        return {
          '@type': 'Question',
          name: it.q,
          acceptedAnswer: { '@type': 'Answer', text: it.a }
        };
      })
    });
  }

  /**
   * Inject SoftwareApplication schema for an app page.
   * opts: {name, description, url, keywords[]}
   */
  function softwareApp(opts) {
    opts = opts || {};
    return jsonld({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: opts.name || document.title,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: opts.description || '',
      url: opts.url || window.location.href,
      keywords: (opts.keywords || []).join(', '),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
      publisher: {
        '@type': 'Organization',
        name: 'VisionQuantech',
        url: 'https://visionquantech.com'
      }
    });
  }

  /** Override <title> and meta description at runtime (optional). */
  function setMeta(title, description) {
    if (title) document.title = title;
    if (description) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', description);
    }
  }

  return { jsonld: jsonld, faq: faq, softwareApp: softwareApp, setMeta: setMeta };
})();
