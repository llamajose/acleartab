// --- 0. PREFERENCES ---
const prefs = { clock24: true, showSeconds: false };

// --- 1. CLOCK ---
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');
const pad = n => String(n).padStart(2, '0');

function updateClock() {
  const now = new Date();
  let h = now.getHours();
  let suffix = '';
  if (!prefs.clock24) {
    suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  }
  const hStr = prefs.clock24 ? pad(h) : String(h);
  const sec = prefs.showSeconds ? `<span class="clock-sec">:${pad(now.getSeconds())}</span>` : '';
  const ampm = suffix ? `<span class="clock-ampm">${suffix}</span>` : '';
  clockEl.innerHTML = `${hStr}:${pad(now.getMinutes())}${sec}${ampm}`;
  dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
updateClock();
setInterval(updateClock, 1000);

// --- 2. SEARCH lives in search.js ---

// --- 3. SETTINGS PANEL ---
const gearIcon = document.getElementById('gear-icon');
const settingsPanel = document.getElementById('settings-panel');
const settingsOpen = () => !settingsPanel.classList.contains('hidden');

function openSettings() { settingsPanel.classList.remove('hidden'); }
function closeSettings() { settingsPanel.classList.add('hidden'); }

gearIcon.addEventListener('click', () => settingsOpen() ? closeSettings() : openSettings());
document.getElementById('settings-close').addEventListener('click', closeSettings);

document.addEventListener('mousedown', (e) => {
  if (settingsOpen() && !settingsPanel.contains(e.target) && !gearIcon.contains(e.target)) {
    closeSettings();
  }
});

// Clock options
const opt24h = document.getElementById('opt-24h');
const optSeconds = document.getElementById('opt-seconds');

opt24h.addEventListener('change', () => {
  prefs.clock24 = opt24h.checked;
  chrome.storage.local.set({ clock24: prefs.clock24 });
  updateClock();
});
optSeconds.addEventListener('change', () => {
  prefs.showSeconds = optSeconds.checked;
  chrome.storage.local.set({ showSeconds: prefs.showSeconds });
  updateClock();
});

// Weather options
const unitToggle = document.getElementById('unit-toggle');
const weatherLoc = document.getElementById('weather-loc');

function setUnitUI(unit) {
  unitToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.unit === unit));
}

unitToggle.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-unit]');
  if (!btn) return;
  setUnitUI(btn.dataset.unit);
  await chrome.storage.local.set({ unit: btn.dataset.unit });
  getWeather(); // cached data covers both units, no refetch needed
});

async function saveLocation() {
  const value = weatherLoc.value.trim();
  const { weatherLoc: current = '' } = await chrome.storage.local.get('weatherLoc');
  if (value === current) return;
  await chrome.storage.local.set({ weatherLoc: value });
  document.getElementById('weather-widget').innerHTML = '<div class="wx-loading">Loading weather…</div>';
  getWeather(true);
}
weatherLoc.addEventListener('change', saveLocation);
weatherLoc.addEventListener('keydown', (e) => { if (e.key === 'Enter') weatherLoc.blur(); });

// --- 4. BACKGROUND ---
const bgContainer = document.getElementById('bg-container');
const bgStatus = document.getElementById('bg-status');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setMedia(dataUrl, type) {
  bgContainer.innerHTML = '';
  if (!dataUrl) { bgStatus.textContent = 'None'; return; }
  let el;
  if (type && type.startsWith('video')) {
    el = document.createElement('video');
    el.src = dataUrl;
    el.loop = true;
    el.muted = true;
    el.playsInline = true;
    if (!reduceMotion.matches) el.autoplay = true;
    bgStatus.textContent = 'Custom video';
  } else {
    el = document.createElement('img');
    el.src = dataUrl;
    el.alt = '';
    bgStatus.textContent = 'Custom image';
  }
  el.className = 'bg-media';
  bgContainer.appendChild(el);
}

// Pause the video when the tab isn't visible — saves battery
document.addEventListener('visibilitychange', () => {
  const video = bgContainer.querySelector('video');
  if (!video) return;
  if (document.hidden || reduceMotion.matches) video.pause();
  else video.play().catch(() => {});
});

document.getElementById('bg-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target.result;
    chrome.storage.local.set({ savedBg: dataUrl, bgType: file.type });
    setMedia(dataUrl, file.type);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

document.getElementById('reset-bg').addEventListener('click', () => {
  chrome.storage.local.remove(['savedBg', 'bgType']);
  setMedia(null);
});

// --- 5. QUICK LINKS ---
let quickLinks = [];

function normalizeUrl(raw) {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { return new URL(withScheme).href; } catch { return null; }
}

function faviconFor(href) {
  return `https://www.google.com/s2/favicons?sz=128&domain=${new URL(href).hostname}`;
}

function saveLinks() {
  chrome.storage.local.set({ quickLinks });
  renderLinks();
}

function renderLinks() {
  const dock = document.getElementById('quick-links');
  const list = document.getElementById('link-list');
  dock.innerHTML = '';
  list.innerHTML = '';

  quickLinks.forEach((link, index) => {
    const href = normalizeUrl(link.url);
    if (!href) return;

    // Dock tile
    const a = document.createElement('a');
    a.href = href;
    a.className = 'quick-link-item';
    a.title = link.name;
    const img = document.createElement('img');
    img.src = faviconFor(href);
    img.alt = '';
    a.appendChild(img);
    dock.appendChild(a);

    // Settings row
    const li = document.createElement('li');
    li.className = 'link-row';
    const icon = document.createElement('img');
    icon.src = faviconFor(href);
    icon.alt = '';
    const text = document.createElement('div');
    text.className = 'link-text';
    const name = document.createElement('span');
    name.className = 'link-name';
    name.textContent = link.name;
    const host = document.createElement('span');
    host.className = 'link-host';
    host.textContent = new URL(href).hostname.replace(/^www\./, '');
    text.append(name, host);

    const actions = document.createElement('div');
    actions.className = 'link-actions';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'icon-btn';
    up.textContent = '↑';
    up.title = 'Move left';
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      [quickLinks[index - 1], quickLinks[index]] = [quickLinks[index], quickLinks[index - 1]];
      saveLinks();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn icon-btn-danger';
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      quickLinks.splice(index, 1);
      saveLinks();
    });
    actions.append(up, del);

    li.append(icon, text, actions);
    list.appendChild(li);
  });

  if (!quickLinks.length) {
    const empty = document.createElement('li');
    empty.className = 'link-empty';
    empty.textContent = 'No links yet';
    list.appendChild(empty);
  }
}

document.getElementById('add-link-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('link-name');
  const urlInput = document.getElementById('link-url');
  const href = normalizeUrl(urlInput.value.trim());
  if (!href) { urlInput.focus(); urlInput.classList.add('invalid'); return; }
  urlInput.classList.remove('invalid');
  const host = new URL(href).hostname.replace(/^www\./, '');
  const name = nameInput.value.trim() || host.split('.')[0].replace(/^./, c => c.toUpperCase());
  quickLinks.push({ name, url: href });
  saveLinks();
  nameInput.value = '';
  urlInput.value = '';
  nameInput.focus();
});

// --- 6. KEYBOARD ---
// Note: Chrome gives the address bar focus on a new tab, so this kicks in once the page has focus.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsOpen()) { closeSettings(); return; }
  if (e.target.matches('input, textarea, select, [contenteditable]')) return;
  if (settingsOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); searchInput.focus(); return; }
  if (e.key.length === 1) searchInput.focus(); // the keystroke lands in the input
});

// --- 7. STARTUP ---
async function init() {
  const store = await chrome.storage.local.get([
    'savedBg', 'bgType', 'unit', 'quickLinks', 'clock24', 'showSeconds', 'weatherLoc'
  ]);
  if (typeof store.clock24 === 'boolean') prefs.clock24 = store.clock24;
  if (typeof store.showSeconds === 'boolean') prefs.showSeconds = store.showSeconds;
  opt24h.checked = prefs.clock24;
  optSeconds.checked = prefs.showSeconds;
  updateClock();

  setUnitUI(store.unit === 'C' ? 'C' : 'F');
  weatherLoc.value = store.weatherLoc || '';

  setMedia(store.savedBg, store.bgType);

  if (Array.isArray(store.quickLinks)) quickLinks = store.quickLinks;
  renderLinks();
}
init();
