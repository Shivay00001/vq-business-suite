# apps/ — builder quick-start

Each app lives in its own folder: `apps/<app-slug>/` with `index.html` + `app.js`.
The full per-app contract is in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §3 — read it first.

## Minimal `index.html` skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Name – Free Use-case for Indian SMEs | VisionQuantech Business Suite</title>
  <meta name="description" content="...">
  <meta name="keywords" content="english keyword, हिंदी कीवर्ड">
  <link rel="stylesheet" href="../../core/shell.css">
</head>
<body data-app="app-slug">
  <main class="vq-main">
    <div id="ad-top"></div>
    <h1>App Name</h1>
    <!-- tool UI -->
    <div id="ad-bottom"></div>
    <section class="vq-faq"><!-- FAQ --></section>
  </main>
  <script src="../../core/shell.js"></script>
  <script src="../../core/vault.js"></script>
  <script src="../../core/freemium.js"></script>
  <script src="../../core/ads.js"></script>
  <script src="../../core/seo.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

Then register the app in `../core/apps.json`. Batch-1 slugs are listed in the brief.
