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

  if (!upcoming.length) {
    canvasList.appendChild(el('div', 'canvas-empty', `Nothing due in the next ${CANVAS_DAYS} days`));
    return;
  }

  upcoming.slice(0, CANVAS_MAX).forEach(e => {
    const row = el('a', `canvas-item ${urgency(e.due)}`);
    row.href = e.url || 'https://hartnell.instructure.com/calendar';

    const chip = el('span', 'canvas-course', shortCourse(e.course));
    chip.style.setProperty('--hue', courseHue(e.course));
    chip.title = e.course;

    const body = el('span', 'canvas-body');
    const title = el('span', 'canvas-title', e.title);
    title.title = e.title;
    body.append(title, el('span', 'canvas-due', dueLabel(e.due)));

    const done = el('button', 'canvas-done', '✓');
    done.type = 'button';
    done.title = 'Mark done (hides it)';
    done.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      canvasDone.push(e.uid);
      // Only remember UIDs still in the cached window so the list doesn't grow forever
      const live = new Set(res.events.map(x => x.uid));
      canvasDone = canvasDone.filter(u => live.has(u));
      chrome.storage.local.set({ canvasDone });
      renderCanvas();
    });

    row.append(chip, body, done);
    canvasList.appendChild(row);
  });

  const more = upcoming.length - CANVAS_MAX;
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
}
canvasUrlInput.addEventListener('change', saveCanvasUrl);
canvasUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') canvasUrlInput.blur(); });
document.getElementById('canvas-refresh').addEventListener('click', () => {
  document.getElementById('canvas-status').textContent = 'Refreshing…';
  loadCanvas(true);
});

// ─── STARTUP ───────────────────────────────────────────────────────
// Optional, git-ignored src/config.local.json seeds personal defaults (feed URL, services)
// on first run, so private URLs never land in the public repo.
async function seedLocalConfig() {
  const { localSeeded } = await chrome.storage.local.get('localSeeded');
  if (localSeeded) return;
  try {
    const res = await fetch(chrome.runtime.getURL('src/config.local.json'));
    if (res.ok) {
      const cfg = await res.json();
      const patch = {};
      const cur = await chrome.storage.local.get(['canvasUrl', 'services']);
      if (cfg.canvasUrl && !cur.canvasUrl) patch.canvasUrl = cfg.canvasUrl;
      if (Array.isArray(cfg.services) && !(cur.services && cur.services.length)) patch.services = cfg.services;
      await chrome.storage.local.set(patch);
    }
  } catch { /* no local config — fine */ }
  await chrome.storage.local.set({ localSeeded: true });
}

async function initWidgets() {
  await seedLocalConfig();
  const store = await chrome.storage.local.get(['canvasUrl', 'canvasDone', 'services']);
  canvasUrlInput.value = store.canvasUrl || '';
  canvasDone = Array.isArray(store.canvasDone) ? store.canvasDone : [];
  services = Array.isArray(store.services) ? store.services : [];
  renderStatus();
  loadCanvas();
  loadStatus();
  setInterval(() => loadStatus(), 2 * 60 * 1000);
  setInterval(() => { if (!document.hidden) loadCanvas(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadStatus(); renderCanvas(); } });
}
initWidgets();
