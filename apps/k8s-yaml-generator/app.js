/* ============================================================
   Kubernetes YAML Generator — pure generation layer (DOM-free,
   unit-testable in node). Emits a Deployment + Service manifest
   pair (apps/v1, v1) separated by `---`.
   ============================================================ */

function k8sNameOk(name) {
  return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(String(name || '')) && String(name).length <= 253;
}

function k8sQtyOk(q) {
  // CPU: "500m", "2"; memory: "128Mi", "1Gi", "512M", "2G"
  return /^\d+(\.\d+)?(m|Mi|Gi|M|G|Ki|K)?$/.test(String(q || '').trim());
}

/**
 * Validate generator inputs. Returns an array of error strings
 * (empty array = valid).
 */
function validateK8s(o) {
  var errs = [];
  if (!k8sNameOk(o.appName)) {
    errs.push('App name must be a valid DNS subdomain: lowercase letters, digits and "-", e.g. "my-api".');
  }
  if (!o.image || !String(o.image).trim()) {
    errs.push('Container image is required, e.g. "myregistry.io/team/api:1.2.0".');
  } else {
    var img = String(o.image).trim();
    var afterSlash = img.slice(img.lastIndexOf('/') + 1);
    if (afterSlash.indexOf(':') < 0 || /:latest$/.test(afterSlash)) {
      errs.push('Pin an explicit image tag — an untagged image or ":latest" is not reproducible.');
    }
  }
  var r = parseInt(o.replicas, 10);
  if (!(r >= 1)) errs.push('Replicas must be a whole number ≥ 1.');
  var p = parseInt(o.port, 10);
  if (!(p >= 1 && p <= 65535)) errs.push('Container port must be between 1 and 65535.');
  if (['ClusterIP', 'NodePort', 'LoadBalancer'].indexOf(o.serviceType) < 0) {
    errs.push('Service type must be ClusterIP, NodePort or LoadBalancer.');
  }
  [['cpuRequest', o.cpuRequest], ['cpuLimit', o.cpuLimit],
   ['memRequest', o.memRequest], ['memLimit', o.memLimit]].forEach(function (pair) {
    if (pair[1] && !k8sQtyOk(pair[1])) {
      errs.push('Invalid resource quantity for ' + pair[0] + ': "' + pair[1] + '" (e.g. "500m", "128Mi", "1Gi").');
    }
  });
  (o.env || []).forEach(function (e) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.k)) {
      errs.push('"' + e.k + '" is not a valid env var name.');
    }
  });
  return errs;
}

function yamlQ(s) {
  s = String(s == null ? '' : s);
  if (/^[A-Za-z0-9_.\/-]+$/.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * o: { appName, image, replicas, port, serviceType, env[{k,v}],
 *      cpuRequest, cpuLimit, memRequest, memLimit }
 * Returns the manifest YAML text.
 */
function buildK8sYaml(o) {
  var name = String(o.appName).trim();
  var L = [];
  L.push('# Generated with VisionQuantech K8s YAML Generator — review before `kubectl apply`.');
  L.push('apiVersion: apps/v1');
  L.push('kind: Deployment');
  L.push('metadata:');
  L.push('  name: ' + yamlQ(name));
  L.push('  labels:');
  L.push('    app: ' + yamlQ(name));
  L.push('spec:');
  L.push('  replicas: ' + parseInt(o.replicas, 10));
  L.push('  selector:');
  L.push('    matchLabels:');
  L.push('      app: ' + yamlQ(name));
  L.push('  template:');
  L.push('    metadata:');
  L.push('      labels:');
  L.push('        app: ' + yamlQ(name));
  L.push('    spec:');
  L.push('      containers:');
  L.push('      - name: ' + yamlQ(name));
  L.push('        image: ' + yamlQ(String(o.image).trim()));
  L.push('        ports:');
  L.push('        - containerPort: ' + parseInt(o.port, 10));
  if (o.env && o.env.length) {
    L.push('        env:');
    o.env.forEach(function (e) {
      L.push('        - name: ' + e.k);
      L.push('          value: ' + yamlQ(e.v));
    });
  }
  if (o.cpuRequest || o.cpuLimit || o.memRequest || o.memLimit) {
    L.push('        resources:');
    if (o.cpuRequest || o.memRequest) {
      L.push('          requests:');
      if (o.cpuRequest) L.push('            cpu: ' + yamlQ(o.cpuRequest));
      if (o.memRequest) L.push('            memory: ' + yamlQ(o.memRequest));
    }
    if (o.cpuLimit || o.memLimit) {
      L.push('          limits:');
      if (o.cpuLimit) L.push('            cpu: ' + yamlQ(o.cpuLimit));
      if (o.memLimit) L.push('            memory: ' + yamlQ(o.memLimit));
    }
  }
  L.push('---');
  L.push('apiVersion: v1');
  L.push('kind: Service');
  L.push('metadata:');
  L.push('  name: ' + yamlQ(name));
  L.push('spec:');
  L.push('  type: ' + o.serviceType);
  L.push('  selector:');
  L.push('    app: ' + yamlQ(name));
  L.push('  ports:');
  L.push('  - protocol: TCP');
  L.push('    port: ' + (o.serviceType === 'NodePort' ? 80 : parseInt(o.port, 10)));
  L.push('    targetPort: ' + parseInt(o.port, 10));
  L.push('');
  return L.join('\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function k8sInit() {
  var SLUG = 'k8s-yaml-generator';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Kubernetes Deployment YAML kaise likhein? (How do I write a K8s Deployment?)',
      a: 'You need apiVersion apps/v1, kind Deployment, metadata.name, a selector matching the pod template labels, replicas, and the container spec (image, ports, env, resources). This generator builds it plus a matching Service.' },
    { q: 'ClusterIP vs NodePort vs LoadBalancer me kya antar hai?',
      a: 'ClusterIP exposes the app only inside the cluster. NodePort opens a port on every node. LoadBalancer provisions a cloud load balancer (on AWS/GCP/Azure) in front of the Service.' },
    { q: 'K8s me resource requests aur limits kya hote hain?',
      a: 'Requests tell the scheduler how much CPU/memory the pod needs; limits cap what it can use. Set both so one noisy pod can\'t starve the node.' },
    { q: 'Generated YAML ko kaise apply karein?',
      a: 'Save it as app.yaml and run "kubectl apply -f app.yaml". Check rollout with "kubectl rollout status deployment/<name>".' },
    { q: 'Kya ye generator offline kaam karta hai?',
      a: 'Yes — manifests are generated entirely in your browser and can be saved to this device\'s vault.' }
  ]);
  SEO.softwareApp({
    name: 'Kubernetes YAML Generator — Free Online',
    description: 'Free Kubernetes manifest generator: Deployment + Service YAML with replicas, env vars and resource limits, validated before generation.',
    keywords: ['kubernetes yaml generator', 'k8s deployment yaml generator', 'kubernetes manifest generator', 'k8s yaml kaise banaye']
  });

  function readOpts() {
    var env = [];
    el('envVars').value.split('\n').forEach(function (ln) {
      var t = ln.trim();
      if (!t) return;
      var eq = t.indexOf('=');
      if (eq > 0) env.push({ k: t.slice(0, eq).trim(), v: t.slice(eq + 1).trim() });
    });
    return {
      appName: el('appName').value.trim(),
      image: el('image').value.trim(),
      replicas: el('replicas').value,
      port: el('port').value,
      serviceType: el('serviceType').value,
      env: env,
      cpuRequest: el('cpuRequest').value.trim(),
      cpuLimit: el('cpuLimit').value.trim(),
      memRequest: el('memRequest').value.trim(),
      memLimit: el('memLimit').value.trim()
    };
  }

  function generate() {
    var o = readOpts();
    var errs = validateK8s(o);
    var errBox = el('k8s-error');
    if (errs.length) {
      errBox.innerHTML = errs.map(esc).join('<br>');
      el('k8s-result').style.display = 'none';
      return;
    }
    errBox.textContent = '';
    el('k8s-output').textContent = buildK8sYaml(o);
    el('k8s-result').style.display = 'block';
    el('k8s-upsell').innerHTML = '';
  }

  function copyOut() {
    var t = el('k8s-output').textContent;
    var msg = el('k8s-msg');
    function ok() { msg.textContent = 'Copied to clipboard.'; }
    function fail() { msg.textContent = 'Copy failed — select the text manually.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, fail);
    } else {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(); }
      ta.remove();
    }
  }

  function downloadOut() {
    var blob = new Blob([el('k8s-output').textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (el('appName').value.trim() || 'app') + '.yaml';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('k8s-msg').textContent = 'Manifest downloaded.';
  }

  async function saveDraft() {
    var msg = el('k8s-msg');
    if (el('k8s-result').style.display === 'none') { msg.textContent = 'Generate a valid manifest first.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('k8s-upsell'), SLUG, SAVE_LIMIT); return; }
    el('k8s-upsell').innerHTML = '';
    var name = (el('appName').value.trim() || 'k8s-app') + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: name, opts: readOpts(), yaml: el('k8s-output').textContent });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('k8s-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved manifests yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.yaml) { el('k8s-output').textContent = d.yaml; el('k8s-result').style.display = 'block'; }
          } catch (e) { el('k8s-msg').textContent = 'Could not load: ' + e.message; }
        });
      });
      list.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', async function () {
          await Vault.remove(SLUG, b.getAttribute('data-del'));
          refreshSaved();
        });
      });
    } catch (e) {
      list.innerHTML = '<p class="vq-hint">Vault unavailable in this browser.</p>';
    }
  }

  el('genBtn').addEventListener('click', generate);
  el('copyBtn').addEventListener('click', copyOut);
  el('dlBtn').addEventListener('click', downloadOut);
  el('saveBtn').addEventListener('click', saveDraft);
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', k8sInit);
  } else { k8sInit(); }
}
