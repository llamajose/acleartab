// Canvas "Due soon" card and homelab status strip, plus their settings.

function bgMessage(msg) {
  return new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r); }); }
    catch { resolve(null); }
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

// ─── CANVAS ────────────────────────────────────────────────────────
const canvasWidget = document.getElementById('canvas-widget');
const canvasList = document.getElementById('canvas-list');
const CANVAS_DAYS = 14;
const CANVAS_MAX = 6;
let canvasDone = [];
let canvasData = null;

// "Statistics w/ Support Fall 2026" → "Statistics", "HIST-C1002-7603" → "HIST", "BUS-32-7046 (1st 8 Weeks)" → "BUS"
function shortCourse(name) {
  const clean = (name || '').replace(/\(.*?\)/g, '').replace(/\b(fall|spring|summer|winter)\b\s*\d{4}/i, '').trim();
  const code = clean.match(/^([A-Z]{2,5})[-\s]?C?\d/);
  if (code) return code[1];
  return clean.split(/\s+/)[0] || '—';
}

function courseHue(name) {
  let h = 0;
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function dueLabel(ms) {
  const due = new Date(ms);
  const now = new Date();
  const dayDiff = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()) -
    new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff < 7) return `${due.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function urgency(ms) {
  const h = (ms - Date.now()) / 36e5;
  return h < 24 ? 'urgent' : h < 72 ? 'soon' : '';
}

function doneButton(id) {
  const done = el('button', 'canvas-done', '✓');
  done.type = 'button';
  done.title = 'Hide';
  done.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    canvasDone.push(id);
    pruneDone();
    chrome.storage.local.set({ canvasDone });
    renderCanvas();
  });
  return done;
}

// Only remember hidden IDs that still exist, so the list doesn't grow forever
function pruneDone() {
  const live = new Set();
  if (canvasData && canvasData.ok) canvasData.events.forEach(e => live.add(e.uid));
  if (gradesData && gradesData.ok) gradesData.missing.forEach(m => live.add(`missing-${m.id}`));
  canvasDone = canvasDone.filter(u => live.has(u));
}

function missingRow(m) {
  const row = el('a', 'canvas-item missing');
  row.href = m.url;
  const chip = el('span', 'canvas-course', shortCourse(m.course));
  chip.style.setProperty('--hue', courseHue(m.course));
  chip.title = m.course;
  const body = el('span', 'canvas-body');
  const title = el('span', 'canvas-title', m.title);
  title.title = m.title;
  const when = m.due ? new Date(m.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const pts = m.points ? ` · ${m.points} pts` : '';
  body.append(title, el('span', 'canvas-due', `Missing${when ? ` · was due ${when}` : ''}${pts}`));
  row.append(chip, body, doneButton(`missing-${m.id}`));
  return row;
}

function renderCanvas() {
  canvasList.innerHTML = '';
  const res = canvasData;

  if (!res || (!res.ok && res.reason === 'unset')) {
    const b = el('button', 'canvas-connect', 'Connect your Canvas calendar');
    b.type = 'button';
    b.addEventListener('click', () => {
      openSettings();
      const input = document.getElementById('canvas-url');
      input.scrollIntoView({ block: 'center' });
      input.focus();
    });
    canvasList.appendChild(b);
    return;
  }
  if (!res.ok) {
    canvasList.appendChild(el('div', 'canvas-empty', "Couldn't load Canvas"));
    return;
  }

  const now = Date.now();
  const horizon = now + CANVAS_DAYS * 864e5;
  const upcoming = res.events.filter(e => e.due >= now && e.due <= horizon && !canvasDone.includes(e.uid));
  const missing = gradesData && gradesData.ok
    ? gradesData.missing.filter(m => !canvasDone.includes(`missing-${m.id}`))
    : [];

  missing.forEach(m => canvasList.appendChild(missingRow(m)));

  if (!upcoming.length) {
    canvasList.appendChild(el('div', 'canvas-empty', `Nothing due in the next ${CANVAS_DAYS} days`));
    return;
  }

  upcoming.slice(0, Math.max(CANVAS_MAX - missing.length, 3)).forEach(e => {
    const row = el('a', `canvas-item ${urgency(e.due)}`);
    row.href = e.url || 'https://hartnell.instructure.com/calendar';

    const chip = el('span', 'canvas-course', shortCourse(e.course));
    chip.style.setProperty('--hue', courseHue(e.course));
    chip.title = e.course;

    const body = el('span', 'canvas-body');
    const title = el('span', 'canvas-title', e.title);
    title.title = e.title;
    body.append(title, el('span', 'canvas-due', dueLabel(e.due)));

    const done = doneButton(e.uid);
    row.append(chip, body, done);
    canvasList.appendChild(row);
  });

  const more = upcoming.length - Math.max(CANVAS_MAX - missing.length, 3);
  if (more > 0) canvasList.appendChild(el('div', 'canvas-more', `+${more} more in the next ${CANVAS_DAYS} days`));
}

async function loadCanvas(force = false) {
  canvasData = await bgMessage({ type: 'CANVAS', force });
  renderCanvas();
  updateCanvasStatus();
}

function updateCanvasStatus() {
  const s = document.getElementById('canvas-status');
  const r = canvasData;
  if (!r || r.reason === 'unset') s.textContent = 'Not connected';
  else if (!r.ok) s.textContent = `Error: ${r.message || 'could not load feed'}`;
  else {
    const n = r.events.filter(e => e.due >= Date.now()).length;
    s.textContent = `${n} upcoming · updated ${ago(r.time)}${r.stale ? ' (offline)' : ''}`;
  }
}

// ─── GRADES ────────────────────────────────────────────────────────
const gradesList = document.getElementById('grades-list');
let gradesData = null;
let activeTab = 'due';

function letterFor(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
}

function renderGrades() {
  gradesList.innerHTML = '';
  const res = gradesData;

  if (!res || res.reason === 'unset') {
    const b = el('button', 'canvas-connect', 'Add a Canvas token to see grades');
    b.type = 'button';
    b.addEventListener('click', () => {
      openSettings();
      const input = document.getElementById('canvas-token');
      input.scrollIntoView({ block: 'center' });
      input.focus();
    });
    gradesList.appendChild(b);
    return;
  }
  if (!res.ok) {
    gradesList.appendChild(el('div', 'canvas-empty',
      res.reason === 'nofeed' ? 'Add your Canvas feed URL first' : `Couldn't load grades: ${res.message || 'error'}`));
    return;
  }
  if (!res.courses.length) {
    gradesList.appendChild(el('div', 'canvas-empty', 'No graded courses yet'));
    return;
  }

  const missingBy = {};
  res.missing.forEach(m => { missingBy[m.course] = (missingBy[m.course] || 0) + 1; });

  res.courses.forEach(c => {
    const row = el('a', 'grade-item');
    row.href = c.url;
    const letter = c.grade || letterFor(c.score);
    row.dataset.letter = letter[0];

    const chip = el('span', 'canvas-course', shortCourse(c.code));
    chip.style.setProperty('--hue', courseHue(c.code));
    chip.title = c.name;

    const body = el('span', 'canvas-body');
    const name = el('span', 'canvas-title', c.name);
    name.title = c.name;
    const bar = el('span', 'grade-bar');
    const fill = el('span', 'grade-fill');
    fill.style.width = `${Math.max(0, Math.min(100, c.score))}%`;
    bar.appendChild(fill);
    body.append(name, bar);
    const miss = missingBy[c.code];
    if (miss) body.appendChild(el('span', 'grade-missing', `${miss} missing`));

    const score = el('span', 'grade-score');
    score.append(el('span', 'grade-pct', `${c.score.toFixed(1)}%`), el('span', 'grade-letter', letter));

    row.append(chip, body, score);
    gradesList.appendChild(row);
  });

  gradesList.appendChild(el('div', 'canvas-more',
    `Current score (graded work only) · updated ${ago(res.time)}${res.stale ? ' · offline' : ''}`));
}

async function loadGrades(force = false) {
  gradesData = await bgMessage({ type: 'GRADES', force });
  renderGrades();
  renderCanvas(); // missing work shows in the Due soon tab
}

function setTab(tab) {
  activeTab = tab === 'grades' ? 'grades' : 'due';
  document.querySelectorAll('.widget-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
  canvasList.classList.toggle('hidden', activeTab !== 'due');
  gradesList.classList.toggle('hidden', activeTab !== 'grades');
  document.getElementById('canvas-link').href = activeTab === 'grades'
    ? 'https://hartnell.instructure.com/grades'
    : 'https://hartnell.instructure.com/calendar';
}

document.querySelectorAll('.widget-tab').forEach(t => t.addEventListener('click', () => {
  setTab(t.dataset.tab);
  chrome.storage.local.set({ canvasTab: activeTab });
}));

// ─── HOMELAB STATUS ────────────────────────────────────────────────
const statusStrip = document.getElementById('status-strip');
let services = [];
let statusResults = [];

function serviceHome(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}/`; } catch { return url; }
}

function renderStatus() {
  statusStrip.innerHTML = '';
  statusStrip.classList.toggle('hidden', !services.length);
  services.forEach((svc, i) => {
    const r = statusResults[i];
    const state = !r ? 'checking' : r.up ? 'up' : 'down';
    const item = el('a', `status-item ${state}`);
    item.href = serviceHome(svc.url);
    item.title = state === 'up' ? `${svc.name}: up · ${r.ms} ms` : state === 'down' ? `${svc.name}: down` : `${svc.name}: checking…`;
    item.append(el('span', 'status-dot'), el('span', 'status-name', svc.name));
    statusStrip.appendChild(item);
  });
  renderServiceList();
}

async function loadStatus(force = false) {
  if (!services.length) { statusResults = []; renderStatus(); return; }
  const res = await bgMessage({ type: 'STATUS', force });
  statusResults = res && res.ok ? res.results : [];
  renderStatus();
}

function renderServiceList() {
  const list = document.getElementById('service-list');
  list.innerHTML = '';
  if (!services.length) { list.appendChild(el('li', 'link-empty', 'No services yet')); return; }
  services.forEach((svc, i) => {
    const r = statusResults[i];
    const li = el('li', 'link-row');
    li.appendChild(el('span', `status-dot ${!r ? 'checking' : r.up ? 'up' : 'down'}`));
    const text = el('div', 'link-text');
    let host = svc.url;
    try { host = new URL(svc.url).host; } catch {}
    text.append(el('span', 'link-name', svc.name), el('span', 'link-host', host));
    const del = el('button', 'icon-btn icon-btn-danger', '✕');
    del.type = 'button';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      services.splice(i, 1);
      statusResults.splice(i, 1);
      chrome.storage.local.set({ services });
      renderStatus();
    });
    const actions = el('div', 'link-actions');
    actions.appendChild(del);
    li.append(text, actions);
    list.appendChild(li);
  });
}

// Adding a service on a host outside the manifest's host_permissions needs a runtime grant.
// The Add click is a user gesture, so Chrome will show its permission prompt.
async function ensureHostPermission(url) {
  const origin = `${new URL(url).origin}/*`;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] }).catch(() => false);
}

document.getElementById('add-service-form').addEventListener('submit', async e => {
  e.preventDefault();
  const nameInput = document.getElementById('service-name');
  const urlInput = document.getElementById('service-url');
  let raw = urlInput.value.trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  let url;
  try { url = new URL(raw).href; } catch { urlInput.classList.add('invalid'); urlInput.focus(); return; }
  urlInput.classList.remove('invalid');
  if (!(await ensureHostPermission(url))) { urlInput.classList.add('invalid'); return; }
  const name = nameInput.value.trim() || new URL(url).hostname.split('.')[0];
  services.push({ name, url });
  await chrome.storage.local.set({ services });
  nameInput.value = '';
  urlInput.value = '';
  statusResults = [];
  renderStatus();
  loadStatus(true);
});

// ─── CANVAS SETTINGS ───────────────────────────────────────────────
const canvasUrlInput = document.getElementById('canvas-url');

async function saveCanvasUrl() {
  const value = canvasUrlInput.value.trim();
  if (value && !/^https:\/\/[^/]+\/feeds\/calendars\/.+\.ics$/i.test(value)) {
    canvasUrlInput.classList.add('invalid');
    document.getElementById('canvas-status').textContent = 'That doesn’t look like a Canvas feed URL (…/feeds/calendars/….ics)';
    return;
  }
  canvasUrlInput.classList.remove('invalid');
  const { canvasUrl = '' } = await chrome.storage.local.get('canvasUrl');
  if (value === canvasUrl) return;
  if (value && !(await ensureHostPermission(value))) return;
  await chrome.storage.local.set({ canvasUrl: value });
  document.getElementById('canvas-status').textContent = value ? 'Loading…' : 'Not connected';
  loadCanvas(true);
  loadGrades(true);
}
canvasUrlInput.addEventListener('change', saveCanvasUrl);
canvasUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') canvasUrlInput.blur(); });
document.getElementById('canvas-refresh').addEventListener('click', () => {
  document.getElementById('canvas-status').textContent = 'Refreshing…';
  loadCanvas(true);
  loadGrades(true);
});

const canvasTokenInput = document.getElementById('canvas-token');
canvasTokenInput.addEventListener('change', async () => {
  const value = canvasTokenInput.value.trim();
  const { canvasToken = '' } = await chrome.storage.local.get('canvasToken');
  if (value === canvasToken) return;
  await chrome.storage.local.set({ canvasToken: value });
  gradesList.innerHTML = '';
  gradesList.appendChild(el('div', 'canvas-empty', 'Loading grades…'));
  loadGrades(true);
});
canvasTokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') canvasTokenInput.blur(); });

// ─── STARTUP ───────────────────────────────────────────────────────
// Optional, git-ignored src/config.local.json seeds personal defaults (feed URL, services)
// on first run, so private URLs never land in the public repo.
async function seedLocalConfig() {
  const SEEDABLE = ['canvasUrl', 'canvasToken', 'services'];
  const store = await chrome.storage.local.get([...SEEDABLE, 'localSeededKeys']);
  const seeded = new Set(store.localSeededKeys || []);
  if (SEEDABLE.every(k => seeded.has(k))) return;
  let cfg;
  try {
    const res = await fetch(chrome.runtime.getURL('src/config.local.json'));
    if (!res.ok) return;
    cfg = await res.json();
  } catch { return; } // no local config: fine
  const patch = {};
  for (const k of SEEDABLE) {
    if (seeded.has(k) || cfg[k] === undefined) continue;
    const empty = store[k] === undefined || store[k] === '' || (Array.isArray(store[k]) && !store[k].length);
    if (empty) patch[k] = cfg[k];
    seeded.add(k); // seed each key once; clearing it later in Settings sticks
  }
  patch.localSeededKeys = [...seeded];
  await chrome.storage.local.set(patch);
}

async function initWidgets() {
  await seedLocalConfig();
  const store = await chrome.storage.local.get(['canvasUrl', 'canvasToken', 'canvasDone', 'services', 'canvasTab']);
  canvasUrlInput.value = store.canvasUrl || '';
  canvasTokenInput.value = store.canvasToken || '';
  setTab(store.canvasTab);
  canvasDone = Array.isArray(store.canvasDone) ? store.canvasDone : [];
  services = Array.isArray(store.services) ? store.services : [];
  renderStatus();
  loadCanvas();
  loadGrades();
  loadStatus();
  setInterval(() => loadStatus(), 2 * 60 * 1000);
  setInterval(() => { if (!document.hidden) { loadCanvas(); loadGrades(); } }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadStatus(); renderCanvas(); } });
}
initWidgets();
