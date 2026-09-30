/* ============================================================
   Git Command Explorer — searchable catalog (DOM-free data +
   filter, unit-testable in node). 60 commands grouped by
   real-world scenario, each with example + plain-English
   explanation.
   ============================================================ */

var GIT_GROUPS = [
  'Start & setup',
  'Stage & commit',
  'Branches',
  'Sync with remote',
  'Undo mistakes',
  'Stash',
  'Rebase & rewrite history',
  'Inspect history',
  'Tags & releases'
];

/* { g: group index, t: scenario title, c: command, d: explanation } */
var GIT_COMMANDS = [
  // ---- Start & setup (5) ----
  { g: 0, t: 'Start a new repo here', c: 'git init', d: 'Turns the current folder into a git repository (creates the hidden .git directory).' },
  { g: 0, t: 'Copy a repo from GitHub', c: 'git clone <url>', d: 'Downloads a full copy of a remote repository, e.g. git clone https://github.com/user/repo.git' },
  { g: 0, t: 'Set your name for commits', c: 'git config --global user.name "Your Name"', d: 'Your name is stamped on every commit you make. Use --global once; it applies to all repos.' },
  { g: 0, t: 'Set your email for commits', c: 'git config --global user.email "you@example.com"', d: 'Use the same email as your GitHub account so commits link to your profile.' },
  { g: 0, t: 'Make "main" the default branch', c: 'git config --global init.defaultBranch main', d: 'New repos will start on "main" instead of the legacy "master" name.' },
  // ---- Stage & commit (8) ----
  { g: 1, t: 'See what changed', c: 'git status -sb', d: 'Short, branch-aware overview: which files are modified, staged or untracked.' },
  { g: 1, t: 'See unstaged changes line-by-line', c: 'git diff', d: 'Shows exactly what changed in tracked files since your last commit.' },
  { g: 1, t: 'See what is staged for commit', c: 'git diff --staged', d: 'Same as git diff but for changes you already added — your last chance to review before committing.' },
  { g: 1, t: 'Stage everything', c: 'git add .', d: 'Stages all new and modified files in this folder. Check git status first so you don\'t stage junk.' },
  { g: 1, t: 'Stage only some changes', c: 'git add -p', d: 'Interactive mode: walks you through each hunk so you can stage part of a file and leave the rest.' },
  { g: 1, t: 'Save a snapshot', c: 'git commit -m "Add login validation"', d: 'Commits staged changes with a message. Write messages in present tense: "Add X", not "Added X".' },
  { g: 1, t: 'Fix the last commit', c: 'git commit --amend', d: 'Adds staged changes into the previous commit (and/or edits its message). Only for commits you have NOT pushed yet.' },
  { g: 1, t: 'Unstage a file (keep its changes)', c: 'git restore --staged <file>', d: 'Removes a file from the staging area but leaves your edits in the working directory untouched.' },
  // ---- Branches (9) ----
  { g: 2, t: 'List local branches', c: 'git branch', d: 'Shows your branches; the current one is marked with *.' },
  { g: 2, t: 'List all branches incl. remote', c: 'git branch -a', d: 'Includes remote-tracking branches like origin/main — useful to see what teammates pushed.' },
  { g: 2, t: 'Jump to another branch', c: 'git switch <branch>', d: 'Switches your working files to that branch. Modern replacement for "git checkout <branch>".' },
  { g: 2, t: 'Create + switch to a new branch', c: 'git switch -c feature/login', d: 'One step for the most common flow: make a branch for your feature and move to it.' },
  { g: 2, t: 'Merge a branch into current', c: 'git merge feature/login', d: 'Pulls the other branch\'s commits into your current branch. Resolve any conflicts it reports.' },
  { g: 2, t: 'Merge keeping branch history visible', c: 'git merge --no-ff feature/login', d: 'Forces a merge commit so the branch stays visible in history instead of fast-forwarding.' },
  { g: 2, t: 'Delete a merged branch', c: 'git branch -d feature/login', d: 'Safe delete: refuses if the branch has unmerged work.' },
  { g: 2, t: 'Force-delete a branch', c: 'git branch -D feature/login', d: 'Deletes even with unmerged commits. Only for branches you are sure you don\'t need.' },
  { g: 2, t: 'Push a new branch to GitHub', c: 'git push -u origin feature/login', d: 'Pushes and sets the upstream (-u) so future "git push"/"git pull" need no arguments.' },
  // ---- Sync with remote (7) ----
  { g: 3, t: 'Download updates without merging', c: 'git fetch', d: 'Fetches all new commits from the remote into origin/* — your files stay untouched until you merge.' },
  { g: 3, t: 'Fetch and clean up deleted branches', c: 'git fetch --prune', d: 'Also removes remote-tracking branches that were deleted on GitHub, keeping "git branch -a" tidy.' },
  { g: 3, t: 'Get latest code', c: 'git pull', d: 'fetch + merge in one step. Your branch gets the newest commits from its upstream.' },
  { g: 3, t: 'Get latest code, keep history linear', c: 'git pull --rebase', d: 'Replays your local commits on top of the fetched ones instead of creating a merge commit.' },
  { g: 3, t: 'Upload your commits', c: 'git push', d: 'Sends your local commits to the remote. Set upstream first with "git push -u origin <branch>".' },
  { g: 3, t: 'Force-push safely', c: 'git push --force-with-lease', d: 'Overwrites the remote branch but aborts if someone else pushed since your last fetch — the safe force-push.' },
  { g: 3, t: 'Connect a local repo to GitHub', c: 'git remote add origin <url>', d: 'Links your local repo to a remote named "origin" so push/pull know where to go.' },
  // ---- Undo mistakes (10) ----
  { g: 4, t: 'Discard changes in one file', c: 'git restore <file>', d: 'Throws away unstaged edits in that file, back to the last commit. Cannot be undone — be sure.' },
  { g: 4, t: 'Undo last commit, keep changes staged', c: 'git reset --soft HEAD~1', d: 'Removes the last commit but leaves its changes staged, ready to recommit differently.' },
  { g: 4, t: 'Undo last commit, keep changes unstaged', c: 'git reset --mixed HEAD~1', d: 'Removes the last commit and unstages everything; your edits stay in the files.' },
  { g: 4, t: 'Nuke the last commit completely', c: 'git reset --hard HEAD~1', d: 'Deletes the commit AND all its changes. Only for local commits you never pushed.' },
  { g: 4, t: 'Undo a pushed commit safely', c: 'git revert <commit>', d: 'Creates a NEW commit that undoes the old one. History stays intact — the right way to fix public commits.' },
  { g: 4, t: 'Revert several commits at once', c: 'git revert --no-commit <c1>..<c2>', d: 'Stages all the reversals without committing, so you can review and commit them together.' },
  { g: 4, t: 'Preview deleting untracked files', c: 'git clean -n', d: 'Dry run: lists files "git clean -fd" WOULD delete, without deleting anything.' },
  { g: 4, t: 'Delete untracked files and folders', c: 'git clean -fd', d: 'Permanently removes files git isn\'t tracking. Run "git clean -n" first to preview.' },
  { g: 4, t: 'Find a "lost" commit', c: 'git reflog', d: 'Shows every move HEAD made — resets, checkouts, rebases — so you can recover commits you thought were gone.' },
  { g: 4, t: 'Recover right after a bad reset', c: 'git reset --hard ORIG_HEAD', d: 'ORIG_HEAD points where HEAD was before the last reset/merge — instant undo for a mistaken reset.' },
  // ---- Stash (5) ----
  { g: 5, t: 'Shelve unfinished work', c: 'git stash push -m "wip: checkout flow"', d: 'Stashes your changes away and gives you a clean tree, e.g. to switch branches quickly.' },
  { g: 5, t: 'See shelved work', c: 'git stash list', d: 'Lists your stashes with messages so you can find the right one to restore.' },
  { g: 5, t: 'Bring a stash back (keep the copy)', c: 'git stash apply stash@{0}', d: 'Restores the stash\'s changes but keeps the stash entry in the list.' },
  { g: 5, t: 'Bring a stash back and drop it', c: 'git stash pop', d: 'Restores the latest stash AND removes it from the list in one step.' },
  { g: 5, t: 'Delete a stash', c: 'git stash drop stash@{0}', d: 'Discards that stash permanently.' },
  // ---- Rebase & rewrite history (6) ----
  { g: 6, t: 'Replay my branch on latest main', c: 'git rebase main', d: 'Moves your branch\'s commits on top of main\'s tip — a clean, linear history. Never rebase pushed shared branches.' },
  { g: 6, t: 'Rewrite my last 3 commits', c: 'git rebase -i HEAD~3', d: 'Interactive rebase: reorder, squash, reword or drop recent local commits in an editor.' },
  { g: 6, t: 'Continue after fixing conflicts', c: 'git rebase --continue', d: 'After you resolve rebase conflicts and stage them, this resumes the rebase.' },
  { g: 6, t: 'Abort a rebase gone wrong', c: 'git rebase --abort', d: 'Cancels the rebase and returns your branch to exactly how it was before.' },
  { g: 6, t: 'Move commits to a new base', c: 'git rebase --onto main old-base feature', d: 'Transplants the "feature" branch from "old-base" onto "main" — for when the base branch changed.' },
  { g: 6, t: 'Auto-squash fixup commits', c: 'git rebase -i --autosquash main', d: 'Pairs "fixup!" commits with their targets automatically during an interactive rebase.' },
  // ---- Inspect history (6) ----
  { g: 7, t: 'Compact recent history', c: 'git log --oneline -10', d: 'Last 10 commits, one line each — the fastest way to see what happened recently.' },
  { g: 7, t: 'Visual branch graph', c: 'git log --graph --oneline --all', d: 'ASCII graph of branches and merges across all branches.' },
  { g: 7, t: 'Show one commit in full', c: 'git show <commit>', d: 'Displays the commit\'s message, author, date and full diff.' },
  { g: 7, t: 'Who changed these lines?', c: 'git blame -L 10,20 <file>', d: 'Annotates lines 10–20 of a file with the commit and author that last touched each line.' },
  { g: 7, t: 'Who committed the most?', c: 'git shortlog -sn', d: 'Commit counts per author — handy for release notes and contribution stats.' },
  { g: 7, t: 'Diff between two commits', c: 'git diff HEAD~1 HEAD', d: 'Shows exactly what the latest commit changed.' },
  // ---- Tags & releases (4) ----
  { g: 8, t: 'Tag a release', c: 'git tag v1.0.0', d: 'Marks the current commit as version 1.0.0 — a lightweight pointer.' },
  { g: 8, t: 'Tag with a message', c: 'git tag -a v1.0.0 -m "First stable release"', d: 'Annotated tag: stores the tagger, date and message — preferred for real releases.' },
  { g: 8, t: 'Push tags to GitHub', c: 'git push origin --tags', d: 'Tags are NOT pushed by a plain "git push" — this sends them all.' },
  { g: 8, t: 'Describe current version', c: 'git describe --tags', d: 'Prints the nearest tag plus commits since it, e.g. v1.0.0-4-gabc123 — great for build versioning.' }
];

/** Case-insensitive filter across scenario, command and explanation. */
function searchGit(q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return GIT_COMMANDS.slice();
  return GIT_COMMANDS.filter(function (e) {
    return (e.t + ' ' + e.c + ' ' + e.d).toLowerCase().indexOf(q) >= 0;
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function gitInit() {
  var SLUG = 'git-command-explorer';
  var SAVE_LIMIT = 25; // favorites save

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Git me last commit kaise undo karein? (How do I undo the last commit?)',
      a: 'If you haven\'t pushed: "git reset --soft HEAD~1" (keeps changes staged) or "--mixed" (keeps them unstaged). If you already pushed, use "git revert HEAD" which creates a new undo commit without rewriting history.' },
    { q: 'Git stash kya hota hai?',
      a: 'Stash temporarily shelves your unfinished changes so you get a clean working tree — e.g. "git stash push -m wip", then "git stash pop" to bring them back.' },
    { q: 'git rebase vs git merge me kya antar hai?',
      a: 'Merge preserves the branch structure with a merge commit; rebase replays your commits on top of the target for a linear history. Rebase only local/private branches — never rewrite pushed shared history.' },
    { q: 'Galti se delete hui file ya commit kaise wapas layein?',
      a: '"git reflog" shows everywhere HEAD has been, so you can find the lost commit hash and restore it with "git reset --hard <hash>" or "git checkout <hash> -- <file>".' },
    { q: 'Kya ye catalog offline kaam karta hai?',
      a: 'Yes — all 60 commands live in the page itself. You can star favorites and they are saved on this device.' }
  ]);
  SEO.softwareApp({
    name: 'Git Command Explorer — 60 Commands with Examples',
    description: 'Searchable catalog of 60 git commands grouped by scenario — undo, stash, rebase, branches — each with example and plain-English explanation.',
    keywords: ['git commands', 'git command list', 'git cheat sheet', 'git undo last commit', 'git stash', 'git rebase', 'git commands with examples']
  });

  var favorites = [];

  async function loadFavorites() {
    try {
      var d = await Vault.load(SLUG, 'favorites');
      favorites = (d && d.cmds) || [];
    } catch (e) { favorites = []; }
  }

  async function toggleFavorite(cmd, btn) {
    var i = favorites.indexOf(cmd);
    if (i >= 0) favorites.splice(i, 1); else favorites.push(cmd);
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('git-upsell'), SLUG, SAVE_LIMIT); return; }
    el('git-upsell').innerHTML = '';
    try {
      await Vault.save(SLUG, 'favorites', { cmds: favorites });
    } catch (e) { /* favorites still work in-memory */ }
    render();
  }

  function copyCmd(cmd, btn) {
    function ok() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(ok, ok);
    } else {
      var ta = document.createElement('textarea');
      ta.value = cmd; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove(); ok();
    }
  }

  function card(e) {
    var fav = favorites.indexOf(e.c) >= 0;
    return '<div class="gcard" data-g="' + e.g + '">' +
      '<div class="ghead"><span class="gt">' + esc(e.t) + '</span>' +
      '<button class="star' + (fav ? ' on' : '') + '" data-fav="' + esc(e.c) + '" aria-label="Star favorite">' + (fav ? '★' : '☆') + '</button></div>' +
      '<code class="gcmd">' + esc(e.c) + '</code>' +
      '<p class="gd">' + esc(e.d) + '</p>' +
      '<button class="vq-btn ghost sm" data-copy="' + esc(e.c) + '">Copy</button></div>';
  }

  function render() {
    var q = el('gitSearch').value;
    var onlyFav = el('favOnly').checked;
    var list = searchGit(q);
    if (onlyFav) list = list.filter(function (e) { return favorites.indexOf(e.c) >= 0; });
    var box = el('git-list');
    el('git-count').textContent = list.length + ' of ' + GIT_COMMANDS.length + ' commands';
    if (!list.length) {
      box.innerHTML = '<p class="vq-hint">No commands match. Try "undo", "stash", "rebase" or "branch".</p>';
      return;
    }
    var html = '', lastG = -1;
    list.forEach(function (e) {
      if (e.g !== lastG) {
        html += '<h2 class="vq-section-sub ggroup">' + esc(GIT_GROUPS[e.g]) + '</h2>';
        lastG = e.g;
      }
      html += card(e);
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () { copyCmd(b.getAttribute('data-copy'), b); });
    });
    box.querySelectorAll('[data-fav]').forEach(function (b) {
      b.addEventListener('click', function () { toggleFavorite(b.getAttribute('data-fav'), b); });
    });
  }

  el('gitSearch').addEventListener('input', render);
  el('favOnly').addEventListener('change', render);
  loadFavorites().then(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gitInit);
  } else { gitInit(); }
}
