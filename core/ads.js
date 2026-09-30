/* ============================================================
   AdSense slot component for the VisionQuantech Business Suite.
   Renders a labeled, responsive placeholder. Paste the real
   AdSense <ins> code where the HTML comment marks — the placeholder
   keeps layouts honest until ads are approved.

     Ads.render(document.getElementById('ad-top'), 'top-leaderboard', 'leaderboard');

   Formats: 'leaderboard' | 'rectangle' | 'banner' | 'fluid' (default)
   ============================================================ */
var Ads = (function () {
  'use strict';

  var FORMATS = ['leaderboard', 'rectangle', 'banner', 'fluid'];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Build the slot HTML string. `id` is a builder-chosen slot name
   * (e.g. 'gst-calc-top'); it is NOT the AdSense ad-slot number —
   * that goes into the <ins> tag you paste at the marked comment.
   */
  function slot(id, format) {
    format = FORMATS.indexOf(format) >= 0 ? format : 'fluid';
    return '' +
      '<div class="ad-slot ad-' + format + '" data-ad-slot="' + esc(id) + '"' +
      ' data-ad-format="' + format + '">' +
      '<!-- GOOGLE ADSENSE: paste your <ins class="adsbygoogle" ' +
      'data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="NNNNNNNNNN"> ' +
      'code HERE for slot "' + esc(id) + '". Then call (adsbygoogle = window.adsbygoogle || []).push({}); -->' +
      '<span class="ad-label">Advertisement</span>' +
      '<span class="ad-size">' + format + ' · slot: ' + esc(id) + '</span>' +
      '</div>';
  }

  /** Inject a slot into element `el`. */
  function render(el, id, format) {
    if (!el) return;
    el.innerHTML = slot(id, format);
  }

  return { slot: slot, render: render, FORMATS: FORMATS };
})();
