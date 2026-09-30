/* ============================================================
   CI Pipeline Generator — pure generation layer (DOM-free,
   unit-testable in node). Emits a GitHub Actions workflow YAML
   or a Declarative Jenkinsfile from language presets.
   ============================================================ */

var CI_PRESETS = {
  node: {
    label: 'Node.js',
    setup: 'node-version: [20]',
    install: 'npm ci',
    test: 'npm test',
    build: 'npm run build'
  },
  python: {
    label: 'Python',
    setup: "python-version: ['3.12']",
    install: 'pip install -r requirements.txt',
    test: 'pytest',
    build: 'python -m build'
  },
  java: {
    label: 'Java (Maven)',
    setup: "java-version: '21'",
    install: 'mvn -q -DskipTests dependency:go-offline',
    test: 'mvn test',
    build: 'mvn -q -DskipTests package'
  },
  go: {
    label: 'Go',
    setup: "go-version: '1.22'",
    install: 'go mod download',
    test: 'go test ./...',
    build: 'go build ./...'
  }
};

/**
 * opts: { language, install, test, build, docker, dockerImage, dockerTag }
 * Returns GitHub Actions workflow YAML.
 */
function buildGithubActions(opts) {
  var p = CI_PRESETS[opts.language] || CI_PRESETS.node;
  var L = [];
  L.push('# Generated with VisionQuantech CI Pipeline Generator — place at .github/workflows/ci.yml');
  L.push('name: CI');
  L.push('');
  L.push('on:');
  L.push('  push:');
  L.push('    branches: [ main ]');
  L.push('  pull_request:');
  L.push('    branches: [ main ]');
  L.push('');
  L.push('jobs:');
  L.push('  build:');
  L.push('    runs-on: ubuntu-latest');
  L.push('    steps:');
  L.push('      - uses: actions/checkout@v4');
  if (opts.language === 'node') {
    L.push('      - uses: actions/setup-node@v4');
    L.push('        with:');
    L.push('          ' + p.setup);
    L.push('          cache: npm');
  } else if (opts.language === 'python') {
    L.push('      - uses: actions/setup-python@v5');
    L.push('        with:');
    L.push('          ' + p.setup);
  } else if (opts.language === 'java') {
    L.push('      - uses: actions/setup-java@v4');
    L.push('        with:');
    L.push('          distribution: temurin');
    L.push('          ' + p.setup);
    L.push('          cache: maven');
  } else if (opts.language === 'go') {
    L.push('      - uses: actions/setup-go@v5');
    L.push('        with:');
    L.push('          ' + p.setup);
  }
  if (opts.install) { L.push('      - name: Install dependencies'); L.push('        run: ' + p.install); }
  if (opts.test) { L.push('      - name: Run tests'); L.push('        run: ' + p.test); }
  if (opts.build) { L.push('      - name: Build'); L.push('        run: ' + p.build); }
  if (opts.docker) {
    var img = opts.dockerImage || 'myapp';
    var tag = opts.dockerTag || 'latest';
    L.push('      - name: Log in to registry');
    L.push('        uses: docker/login-action@v3');
    L.push('        with:');
    L.push('          username: ${{ secrets.REGISTRY_USER }}');
    L.push('          password: ${{ secrets.REGISTRY_PASSWORD }}');
    L.push('      - name: Build and push Docker image');
    L.push('        uses: docker/build-push-action@v6');
    L.push('        with:');
    L.push('          push: true');
    L.push('          tags: ' + img + ':' + tag);
  }
  L.push('');
  return L.join('\n');
}

/**
 * opts: { language, install, test, build, docker, dockerImage, dockerTag }
 * Returns a Declarative Jenkinsfile.
 */
function buildJenkinsfile(opts) {
  var p = CI_PRESETS[opts.language] || CI_PRESETS.node;
  var L = [];
  L.push('// Generated with VisionQuantech CI Pipeline Generator — save as Jenkinsfile');
  L.push('pipeline {');
  L.push('    agent any');
  L.push('    stages {');
  if (opts.install) {
    L.push("        stage('Install') {");
    L.push('            steps {');
    L.push("                sh '" + p.install + "'");
    L.push('            }');
    L.push('        }');
  }
  if (opts.test) {
    L.push("        stage('Test') {");
    L.push('            steps {');
    L.push("                sh '" + p.test + "'");
    L.push('            }');
    L.push('        }');
  }
  if (opts.build) {
    L.push("        stage('Build') {");
    L.push('            steps {');
    L.push("                sh '" + p.build + "'");
    L.push('            }');
    L.push('        }');
  }
  if (opts.docker) {
    var img = opts.dockerImage || 'myapp';
    var tag = opts.dockerTag || 'latest';
    L.push("        stage('Docker Build & Push') {");
    L.push('            steps {');
    L.push("                withCredentials([usernamePassword(credentialsId: 'registry-creds',");
    L.push("                                                usernameVariable: 'REG_USER',");
    L.push("                                                passwordVariable: 'REG_PASS')]) {");
    L.push("                    sh 'echo $REG_PASS | docker login -u $REG_USER --password-stdin'");
    L.push("                    sh 'docker build -t " + img + ':' + tag + " .'");
    L.push("                    sh 'docker push " + img + ':' + tag + "'");
    L.push('                }');
    L.push('            }');
    L.push('        }');
  }
  L.push('    }');
  L.push('    post {');
  L.push("        always { cleanWs() }");
  L.push('    }');
  L.push('}');
  L.push('');
  return L.join('\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function cipInit() {
  var SLUG = 'ci-pipeline-generator';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'GitHub Actions workflow YAML kaise likhein? (How do I write a GitHub Actions workflow?)',
      a: 'Create .github/workflows/ci.yml with "on:" triggers, "jobs:" and "steps:" — checkout, language setup, install, test, build. This generator writes the whole file from your language preset.' },
    { q: 'Jenkinsfile (Declarative Pipeline) kaise likhein?',
      a: 'A Declarative Jenkinsfile has a "pipeline { agent any stages { stage(...) } }" structure with sh steps. Pick the Jenkins tab here and the generator writes it, including an optional Docker push stage.' },
    { q: 'CI me Docker image push kaise karein?',
      a: 'Log in with registry credentials stored as secrets (never hardcoded), then build and push. The generated pipeline uses GitHub secrets REGISTRY_USER/REGISTRY_PASSWORD or a Jenkins "registry-creds" credential.' },
    { q: 'GitHub Actions free hai kya?',
      a: 'Yes — public repositories get generous free minutes, and private repos get 2,000 free minutes/month on the free plan.' },
    { q: 'Kya ye generator offline kaam karta hai?',
      a: 'Yes — the workflow/Jenkinsfile is generated entirely in your browser and can be saved to this device\'s vault.' }
  ]);
  SEO.softwareApp({
    name: 'CI Pipeline Generator — Free Online',
    description: 'Free CI generator: GitHub Actions workflow YAML or Jenkinsfile from Node/Python/Java/Go presets with install, test, build and Docker push steps.',
    keywords: ['github actions generator', 'jenkinsfile generator', 'ci pipeline generator', 'github actions yaml kaise banaye', 'jenkins pipeline example']
  });

  var target = 'github';

  function readOpts() {
    return {
      language: el('language').value,
      install: el('stInstall').checked,
      test: el('stTest').checked,
      build: el('stBuild').checked,
      docker: el('stDocker').checked,
      dockerImage: el('dockerImage').value.trim() || 'myapp',
      dockerTag: el('dockerTag').value.trim() || 'latest'
    };
  }

  function generate() {
    var o = readOpts();
    var errBox = el('cip-error');
    if (!o.install && !o.test && !o.build && !o.docker) {
      errBox.textContent = 'Select at least one step (install, test, build or docker push).';
      el('cip-result').style.display = 'none';
      return;
    }
    errBox.textContent = '';
    var out = target === 'github' ? buildGithubActions(o) : buildJenkinsfile(o);
    el('cip-output').textContent = out;
    el('cip-file').textContent = target === 'github' ? '.github/workflows/ci.yml' : 'Jenkinsfile';
    el('cip-result').style.display = 'block';
    el('cip-upsell').innerHTML = '';
  }

  function setTarget(t) {
    target = t;
    el('tabGithub').classList.toggle('on', t === 'github');
    el('tabJenkins').classList.toggle('on', t === 'jenkins');
    el('cip-result').style.display = 'none';
  }

  function copyOut() {
    var t = el('cip-output').textContent;
    var msg = el('cip-msg');
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
    var blob = new Blob([el('cip-output').textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = target === 'github' ? 'ci.yml' : 'Jenkinsfile';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('cip-msg').textContent = 'Pipeline file downloaded.';
  }

  async function saveDraft() {
    var msg = el('cip-msg');
    if (el('cip-result').style.display === 'none') { msg.textContent = 'Generate a pipeline first.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('cip-upsell'), SLUG, SAVE_LIMIT); return; }
    el('cip-upsell').innerHTML = '';
    var name = target + '-' + el('language').value + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: name, target: target, opts: readOpts(), text: el('cip-output').textContent });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('cip-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved pipelines yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.text) { el('cip-output').textContent = d.text; el('cip-result').style.display = 'block'; }
          } catch (e) { el('cip-msg').textContent = 'Could not load: ' + e.message; }
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

  el('tabGithub').addEventListener('click', function () { setTarget('github'); });
  el('tabJenkins').addEventListener('click', function () { setTarget('jenkins'); });
  el('genBtn').addEventListener('click', generate);
  el('copyBtn').addEventListener('click', copyOut);
  el('dlBtn').addEventListener('click', downloadOut);
  el('saveBtn').addEventListener('click', saveDraft);
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cipInit);
  } else { cipInit(); }
}
