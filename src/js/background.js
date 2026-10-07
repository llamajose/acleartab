// Service worker. Does every network request the new tab page can't make itself
// (MV3 page CSP), and caches results so opening a tab stays instant.
importScripts('ics.js');

const CANVAS_TTL = 30 * 60 * 1000;
const STATUS_TTL = 2 * 60 * 1000;
const RATES_TTL = 6 * 60 * 60 * 1000;

async function fetchWithTimeout(url, ms = 5000, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

// --- Google suggestions ---
async function suggest(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, 4000);
  const data = await res.json();
  return (data[1] || []).slice(0, 6);
}

// --- Canvas calendar feed ---
async function canvas(force) {
  const store = await chrome.storage.local.get(['canvasUrl', 'canvasEvents', 'canvasTime', 'canvasFor']);
  const url = (store.canvasUrl || '').trim();
  if (!url) return { ok: false, reason: 'unset' };

  const fresh = store.canvasEvents && store.canvasFor === url && Date.now() - store.canvasTime < CANVAS_TTL;
  if (!force && fresh) return { ok: true, events: store.canvasEvents, time: store.canvasTime };

  try {
    const res = await fetchWithTimeout(url, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('not a calendar feed');
    // Keep the last 2 days through the next 60 days; the full feed is ~1 MB
    const from = Date.now() - 2 * 864e5;
    const to = Date.now() + 60 * 864e5;
    const events = parseICS(text)
      .filter(e => e.due >= from && e.due <= to)
      .sort((a, b) => a.due - b.due);
    const time = Date.now();
    await chrome.storage.local.set({ canvasEvents: events, canvasTime: time, canvasFor: url });
    return { ok: true, events, time };
  } catch (err) {
    if (store.canvasEvents && store.canvasFor === url) {
      return { ok: true, events: store.canvasEvents, time: store.canvasTime, stale: true };
    }
    return { ok: false, reason: 'error', message: String(err.message || err) };
  }
}

// --- Homelab status ---
async function checkOne(svc) {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(svc.url, 4000, { method: 'GET', redirect: 'follow' });
    // Any HTTP answer means the service is up; 5xx means it's up but unhealthy
    return { ...svc, up: res.status < 500, code: res.status, ms: Date.now() - start };
  } catch {
    return { ...svc, up: false, code: 0, ms: null };
  }
}

async function status(force) {
  const store = await chrome.storage.local.get(['services', 'statusCache', 'statusTime']);
  const services = Array.isArray(store.services) ? store.services : [];
  if (!services.length) return { ok: true, results: [] };

  const key = JSON.stringify(services);
  const cache = store.statusCache;
  if (!force && cache && cache.key === key && Date.now() - store.statusTime < STATUS_TTL) {
    return { ok: true, results: cache.results, time: store.statusTime };
  }
  const results = await Promise.all(services.map(checkOne));
  const time = Date.now();
  await chrome.storage.local.set({ statusCache: { key, results }, statusTime: time });
  return { ok: true, results, time };
}

// --- Currency rates (frankfurter.app, ECB data, no key) ---
async function rates(base) {
  base = base.toUpperCase();
  const { fxCache = {} } = await chrome.storage.local.get('fxCache');
  const hit = fxCache[base];
  if (hit && Date.now() - hit.time < RATES_TTL) return { ok: true, rates: hit.rates, date: hit.date };
  const res = await fetchWithTimeout(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`, 5000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  fxCache[base] = { rates: data.rates, date: data.date, time: Date.now() };
  await chrome.storage.local.set({ fxCache });
  return { ok: true, rates: data.rates, date: data.date };
}

const handlers = {
  SUGGEST: m => suggest(m.query).then(suggestions => ({ ok: true, suggestions })),
  CANVAS: m => canvas(!!m.force),
  STATUS: m => status(!!m.force),
  RATES: m => rates(m.base),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message && message.type];
  if (!handler) return false;
  handler(message)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, reason: 'error', message: String(err.message || err) }));
  return true; // keep the channel open for the async response
});
