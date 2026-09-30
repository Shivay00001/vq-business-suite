/* ============================================================
   Terraform Snippet Generator — pure generation layer
   (DOM-free, unit-testable in node). Emits an HCL resource
   block plus a variables block for the AWS provider.
   ============================================================ */

var TF_PRESETS = {
  ec2: {
    label: 'EC2 Instance (aws_instance)',
    resource: 'aws_instance',
    fields: [
      { k: 'ami', label: 'AMI ID', type: 'string', def: 'ami-0abcdef1234567890', hint: 'e.g. ami-0c55b159cbfafe1f0 (Amazon Linux 2023, ap-south-1)' },
      { k: 'instance_type', label: 'Instance type', type: 'string', def: 't3.micro' },
      { k: 'key_name', label: 'Key pair name (optional)', type: 'string', def: '', hint: 'Leave empty for no SSH key' },
      { k: 'name', label: 'Name tag', type: 'string', def: 'web-server' }
    ]
  },
  s3: {
    label: 'S3 Bucket (aws_s3_bucket)',
    resource: 'aws_s3_bucket',
    fields: [
      { k: 'bucket', label: 'Bucket name (globally unique)', type: 'string', def: 'my-app-assets-2026' },
      { k: 'versioning', label: 'Versioning', type: 'bool', def: 'true' },
      { k: 'sse', label: 'Server-side encryption (AES256)', type: 'bool', def: 'true' }
    ]
  },
  rds: {
    label: 'RDS Database (aws_db_instance)',
    resource: 'aws_db_instance',
    fields: [
      { k: 'identifier', label: 'DB identifier', type: 'string', def: 'app-db' },
      { k: 'engine', label: 'Engine', type: 'string', def: 'postgres' },
      { k: 'instance_class', label: 'Instance class', type: 'string', def: 'db.t3.micro' },
      { k: 'allocated_storage', label: 'Storage (GB)', type: 'number', def: '20' },
      { k: 'db_name', label: 'Database name', type: 'string', def: 'appdb' },
      { k: 'username', label: 'Master username', type: 'string', def: 'admin' },
      { k: 'password', label: 'Master password', type: 'string', def: 'ChangeMe123!', sensitive: true }
    ]
  },
  vpc: {
    label: 'VPC (aws_vpc)',
    resource: 'aws_vpc',
    fields: [
      { k: 'cidr_block', label: 'CIDR block', type: 'string', def: '10.0.0.0/16' },
      { k: 'name', label: 'Name tag', type: 'string', def: 'app-vpc' }
    ]
  }
};

function hclStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function hclVal(type, v) {
  if (type === 'bool') return /^(true|1|yes)$/i.test(String(v).trim()) ? 'true' : 'false';
  if (type === 'number') return /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? String(v).trim() : '0';
  return hclStr(v);
}

/**
 * Build the HCL snippet for a preset.
 * inputs: { fieldKey: value }
 * Returns { hcl, notes[] }.
 */
function buildTerraform(presetKey, inputs) {
  var p = TF_PRESETS[presetKey];
  if (!p) return { hcl: '', notes: ['Unknown preset.'] };
  inputs = inputs || {};
  var notes = [];
  var name = 'main';
  var L = [];
  L.push('# Generated with VisionQuantech Terraform Snippet Generator — review before `terraform apply`.');
  L.push('# Provider: hashicorp/aws. Run `terraform init` first.');
  L.push('');

  if (presetKey === 'ec2') {
    var ami = inputs.ami || p.fields[0].def;
    L.push('resource "aws_instance" "' + name + '" {');
    L.push('  ami           = var.ami');
    L.push('  instance_type = var.instance_type');
    if (inputs.key_name) L.push('  key_name      = var.key_name');
    L.push('');
    L.push('  tags = {');
    L.push('    Name = var.name');
    L.push('  }');
    L.push('}');
    notes.push('AMI IDs are region-specific — verify "' + ami + '" exists in your region (ec2 describe-images).');
    notes.push('t3.micro is in the AWS free tier (750 hrs/month for 12 months) — good for starting out.');
  } else if (presetKey === 's3') {
    L.push('resource "aws_s3_bucket" "' + name + '" {');
    L.push('  bucket = var.bucket');
    L.push('');
    if (/^(true|1|yes)$/i.test(String(inputs.versioning))) {
      L.push('  versioning {');
      L.push('    enabled = true');
      L.push('  }');
      L.push('');
    }
    if (/^(true|1|yes)$/i.test(String(inputs.sse))) {
      L.push('  server_side_encryption_configuration {');
      L.push('    rule {');
      L.push('      apply_server_side_encryption_by_default {');
      L.push('        sse_algorithm = "AES256"');
      L.push('      }');
      L.push('    }');
      L.push('  }');
    }
    L.push('}');
    notes.push('Bucket names are globally unique — pick something with your org/project prefix.');
    notes.push('New buckets block public access by default; open it deliberately if you serve a static site.');
  } else if (presetKey === 'rds') {
    L.push('resource "aws_db_instance" "' + name + '" {');
    L.push('  identifier        = var.identifier');
    L.push('  engine            = var.engine');
    L.push('  instance_class    = var.instance_class');
    L.push('  allocated_storage = var.allocated_storage');
    L.push('  db_name           = var.db_name');
    L.push('  username          = var.username');
    L.push('  password          = var.password   # sensitive — prefer AWS Secrets Manager in production');
    L.push('  skip_final_snapshot = true');
    L.push('}');
    notes.push('Never commit the real password — use a tfvars file (git-ignored) or AWS Secrets Manager.');
    notes.push('skip_final_snapshot = true is for dev; set false with a snapshot identifier for production.');
  } else if (presetKey === 'vpc') {
    L.push('resource "aws_vpc" "' + name + '" {');
    L.push('  cidr_block = var.cidr_block');
    L.push('');
    L.push('  tags = {');
    L.push('    Name = var.name');
    L.push('  }');
    L.push('}');
    notes.push('A bare VPC has no subnets, route tables or internet gateway — add those before launching instances.');
    notes.push('CIDR must not overlap with your other VPCs/VPNs if you plan peering.');
  }

  L.push('');
  L.push('# ---- variables ----');
  p.fields.forEach(function (f) {
    var v = inputs[f.k] !== undefined && inputs[f.k] !== '' ? inputs[f.k] : f.def;
    L.push('variable ' + hclStr(f.k) + ' {');
    L.push('  type    = ' + f.type);
    if (f.sensitive) L.push('  sensitive = true');
    L.push('  default = ' + hclVal(f.type, v));
    L.push('}');
    L.push('');
  });
  return { hcl: L.join('\n'), notes: notes };
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function tfgInit() {
  var SLUG = 'terraform-snippet-generator';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Terraform HCL snippet kaise likhein? (How do I write Terraform HCL?)',
      a: 'A resource block looks like: resource "aws_instance" "web" { ami = ... instance_type = "t3.micro" }. Pick a preset here, fill the fields, and the generator writes the resource plus a variables block.' },
    { q: 'Terraform variables kya hote hain?',
      a: 'Variables let you reuse the same config with different values (dev vs prod). Declare with a "variable" block, reference as var.name, and override via -var flags or a .tfvars file.' },
    { q: 'Terraform apply se pehle kya check karein?',
      a: 'Always run "terraform plan" first and read the diff. For production, keep state remote (S3 + DynamoDB lock) instead of local terraform.tfstate.' },
    { q: 'RDS password Terraform me kaise secure rakhein?',
      a: 'Mark the variable sensitive = true, keep the real value in a git-ignored .tfvars file or AWS Secrets Manager — never commit passwords to git.' },
    { q: 'Kya ye generator offline kaam karta hai?',
      a: 'Yes — the HCL is generated entirely in your browser and can be saved to this device\'s vault.' }
  ]);
  SEO.softwareApp({
    name: 'Terraform Snippet Generator — Free HCL Builder',
    description: 'Free Terraform snippet generator: EC2, S3, RDS, VPC presets with variables blocks. Copy & download HCL, 100% in-browser.',
    keywords: ['terraform snippet generator', 'terraform hcl generator', 'terraform ec2 example', 'terraform s3 bucket example', 'terraform rds example']
  });

  function renderFields() {
    var key = el('preset').value;
    var p = TF_PRESETS[key];
    var box = el('tfg-fields');
    box.innerHTML = '<h2 class="vq-section-sub">' + esc(p.label) + '</h2>' +
      p.fields.map(function (f) {
        var input;
        if (f.type === 'bool') {
          input = '<select id="tf_' + f.k + '"><option value="true"' + (String(f.def) === 'true' ? ' selected' : '') + '>true</option><option value="false"' + (String(f.def) !== 'true' ? ' selected' : '') + '>false</option></select>';
        } else {
          input = '<input id="tf_' + f.k + '" type="' + (f.sensitive ? 'password' : 'text') + '" value="' + esc(f.def) + '" autocomplete="off">';
        }
        return '<div class="vq-field"><label for="tf_' + f.k + '">' + esc(f.label) + '</label>' + input +
          (f.hint ? '<p class="vq-hint">' + esc(f.hint) + '</p>' : '') + '</div>';
      }).join('');
  }

  function readInputs() {
    var key = el('preset').value;
    var inputs = {};
    TF_PRESETS[key].fields.forEach(function (f) {
      var n = el('tf_' + f.k);
      if (n) inputs[f.k] = n.value;
    });
    return inputs;
  }

  function generate() {
    var key = el('preset').value;
    var out = buildTerraform(key, readInputs());
    el('tfg-output').textContent = out.hcl;
    el('tfg-notes').innerHTML = out.notes.map(function (n) {
      return '<li>' + esc(n) + '</li>';
    }).join('');
    el('tfg-result').style.display = 'block';
    el('tfg-upsell').innerHTML = '';
  }

  function copyOut() {
    var t = el('tfg-output').textContent;
    var msg = el('tfg-msg');
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
    var blob = new Blob([el('tfg-output').textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = el('preset').value + '.tf';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('tfg-msg').textContent = 'Terraform file downloaded.';
  }

  async function saveDraft() {
    var msg = el('tfg-msg');
    if (el('tfg-result').style.display === 'none') { msg.textContent = 'Generate a snippet first.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('tfg-upsell'), SLUG, SAVE_LIMIT); return; }
    el('tfg-upsell').innerHTML = '';
    var name = el('preset').value + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: name, preset: el('preset').value, hcl: el('tfg-output').textContent });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('tfg-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved snippets yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.hcl) { el('tfg-output').textContent = d.hcl; el('tfg-result').style.display = 'block'; }
          } catch (e) { el('tfg-msg').textContent = 'Could not load: ' + e.message; }
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

  el('preset').addEventListener('change', function () { renderFields(); el('tfg-result').style.display = 'none'; });
  el('genBtn').addEventListener('click', generate);
  el('copyBtn').addEventListener('click', copyOut);
  el('dlBtn').addEventListener('click', downloadOut);
  el('saveBtn').addEventListener('click', saveDraft);
  renderFields();
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tfgInit);
  } else { tfgInit(); }
}
