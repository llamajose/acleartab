// Smart search: bangs, inline calculator / unit / currency answers,
// bookmarks + history, and Google suggestions.

const searchInput = document.getElementById('search-input');
const suggestionsBox = document.getElementById('search-suggestions');

// ─── Bangs ─────────────────────────────────────────────────────────
const BANGS = {
  g:   { name: 'Google',         url: 'https://www.google.com/search?q=%s', home: 'https://www.google.com' },
  yt:  { name: 'YouTube',        url: 'https://www.youtube.com/results?search_query=%s', home: 'https://www.youtube.com' },
  gh:  { name: 'GitHub',         url: 'https://github.com/search?q=%s&type=repositories', home: 'https://github.com' },
  r:   { name: 'Reddit',         url: 'https://www.google.com/search?q=%s+site%3Areddit.com', home: 'https://www.reddit.com' },
  w:   { name: 'Wikipedia',      url: 'https://en.wikipedia.org/w/index.php?search=%s', home: 'https://en.wikipedia.org' },
  a:   { name: 'Amazon',         url: 'https://www.amazon.com/s?k=%s', home: 'https://www.amazon.com' },
  m:   { name: 'Google Maps',    url: 'https://www.google.com/maps/search/%s', home: 'https://www.google.com/maps' },
  i:   { name: 'Google Images',  url: 'https://www.google.com/search?tbm=isch&q=%s', home: 'https://images.google.com' },
  so:  { name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=%s', home: 'https://stackoverflow.com' },
  mdn: { name: 'MDN',            url: 'https://developer.mozilla.org/en-US/search?q=%s', home: 'https://developer.mozilla.org' },
  npm: { name: 'npm',            url: 'https://www.npmjs.com/search?q=%s', home: 'https://www.npmjs.com' },
  c:   { name: 'Canvas',         url: 'https://hartnell.instructure.com/search?q=%s', home: 'https://hartnell.instructure.com' },
};

// "!yt lofi" or "lofi !yt" → { key, bang, query }
function parseBang(text) {
  const m = text.match(/(?:^|\s)!([a-z]+)(?=\s|$)/i);
  if (!m || !BANGS[m[1].toLowerCase()]) return null;
  const key = m[1].toLowerCase();
  const query = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim();
  return { key, bang: BANGS[key], query };
}

function bangUrl(b) {
  return b.query ? b.bang.url.replace('%s', encodeURIComponent(b.query)) : b.bang.home;
}

function navigate(text) {
  text = text.trim();
  if (!text) return;
  const b = parseBang(text);
  if (b) { window.location.href = bangUrl(b); return; }
  const isIP = /^\d{1,3}(\.\d{1,3}){3}/.test(text);
  const hasSpaces = text.includes(' ');
  if (!hasSpaces && /^https?:\/\//i.test(text)) {
    window.location.href = text;
  } else if (!hasSpaces && (/^localhost\b/.test(text) || isIP)) {
    window.location.href = `http://${text}`;
  } else if (!hasSpaces && /\.[a-z]{2,}(\/|:|$)/i.test(text)) {
    window.location.href = `https://${text}`;
  } else {
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }
}

// ─── Calculator (no eval — MV3 CSP forbids it anyway) ───────────────
function calc(input) {
  const src = input.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').trim();
  if (!/^[\d\s.+\-*/^%()a-z]+$/i.test(src)) return null;
  if (!/\d/.test(src) || !/[+\-*/^%(]|sqrt/i.test(src.replace(/^-/, ''))) return null;
  // Don't "solve" dates, phone numbers or version strings
  const compact = src.replace(/\s/g, '');
  if (/^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\(?\d{3}\)?-?\d{3}-\d{4}$|^\d+\.\d+\.\d+/.test(compact)) return null;

  const tokens = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|sqrt|pi|[+\-*/^%()]|\S/gi);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // Recursive descent: expr → term (+|- term)*, term → factor (*|/|% factor)*, factor → unary (^ factor)?
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  }
  function term() {
    let v = unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const r = unary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  // Unary minus binds looser than ^, so -3^2 = -9 (standard math convention)
  function unary() {
    if (peek() === '-') { next(); return -unary(); }
    if (peek() === '+') { next(); return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek() === '^') { next(); return Math.pow(base, unary()); }
    return base;
  }
  function atom() {
    const t = next();
    if (t === undefined) throw new Error('end');
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error(')'); return v; }
    if (/^sqrt$/i.test(t)) { if (next() !== '(') throw new Error('('); const v = expr(); if (next() !== ')') throw new Error(')'); return Math.sqrt(v); }
    if (/^pi$/i.test(t)) return Math.PI;
    if (/^\d*\.?\d+/.test(t)) return parseFloat(t);
    throw new Error('token ' + t);
  }

  try {
    const v = expr();
    if (pos !== tokens.length || !isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function fmtNum(v, digits = 8) {
  if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(6).replace(/\.?0+e/, 'e');
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

// ─── Units ─────────────────────────────────────────────────────────
const UNITS = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass:   { mg: 1e-6, g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 },
  volume: { ml: 0.001, l: 1, tsp: 0.00492892159375, tbsp: 0.01478676478125, floz: 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784 },
  speed:  { 'm/s': 1, kph: 1 / 3.6, mph: 0.44704, kn: 0.514444 },
  time:   { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, wk: 604800 },
  data:   { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776 },
  temp:   { c: 1, f: 1, k: 1 },
};
const UNIT_ALIASES = {
  millimeter: 'mm', millimeters: 'mm', centimeter: 'cm', centimeters: 'cm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  kilometer: 'km', kilometers: 'km', inch: 'in', inches: 'in', '"': 'in', foot: 'ft', feet: 'ft', "'": 'ft', yard: 'yd', yards: 'yd',
  mile: 'mi', miles: 'mi', gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg',
  ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb', stone: 'st', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  milliliter: 'ml', milliliters: 'ml', gallon: 'gal', gallons: 'gal', quart: 'qt', quarts: 'qt', pint: 'pt', pints: 'pt',
  cups: 'cup', 'fl oz': 'floz', 'fl.oz': 'floz', teaspoon: 'tsp', teaspoons: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  'km/h': 'kph', kmh: 'kph', mps: 'm/s', knot: 'kn', knots: 'kn', sec: 's', secs: 's', second: 's', seconds: 's',
  mins: 'min', minute: 'min', minutes: 'min', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', days: 'day', d: 'day',
  week: 'wk', weeks: 'wk', bytes: 'b', byte: 'b', celsius: 'c', '°c': 'c', fahrenheit: 'f', '°f': 'f', kelvin: 'k',
};
const unitKey = u => { u = u.toLowerCase().trim(); return UNIT_ALIASES[u] || u; };
const dimOf = u => Object.keys(UNITS).find(d => u in UNITS[d]);

function toKelvin(v, u) { return u === 'c' ? v + 273.15 : u === 'f' ? (v - 32) * 5 / 9 + 273.15 : v; }
function fromKelvin(v, u) { return u === 'c' ? v - 273.15 : u === 'f' ? (v - 273.15) * 9 / 5 + 32 : v; }

const CONVERT_RE = /^\$?\s*(-?[\d,]*\.?\d+)\s*([a-z°"'/. ]+?)\s+(?:to|in|into|as|=)\s+([a-z°"'/. ]+)$/i;

function convertUnits(text) {
  const m = text.trim().match(CONVERT_RE);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  const from = unitKey(m[2]);
  const to = unitKey(m[3]);
  const d = dimOf(from);
  if (!d || d !== dimOf(to)) return null;
  const out = d === 'temp' ? fromKelvin(toKelvin(v, from), to) : v * UNITS[d][from] / UNITS[d][to];
  const label = u => (d === 'temp' ? '°' + u.toUpperCase() : u);
  return `${fmtNum(v)} ${label(from)} = ${fmtNum(out, 4)} ${label(to)}`;
}

// Currency: "20 usd to eur", "$20 in mxn"
async function convertCurrency(text) {
  const m = text.trim().match(/^(\$)?\s*(-?[\d,]*\.?\d+)\s*([a-z]{3})?\s+(?:to|in|into|=)\s+([a-z]{3})$/i);
  if (!m) return null;
  const from = (m[3] || (m[1] ? 'USD' : '')).toUpperCase();
  const to = m[4].toUpperCase();
  if (!from || from === to) return null;
  const amount = parseFloat(m[2].replace(/,/g, ''));
  const res = await sendMessage({ type: 'RATES', base: from });
  if (!res || !res.ok || !(to in res.rates)) return null;
  const out = amount * res.rates[to];
  const money = (n, c) => n.toLocaleString(undefined, { style: 'currency', currency: c, maximumFractionDigits: 2 });
  return { label: `${money(amount, from)} = ${money(out, to)}`, sub: `ECB rate, ${res.date}` };
}

// ─── Local results: bookmarks + history ────────────────────────────
function faviconUrl(pageUrl) {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);
}

async function localResults(query) {
  if (query.length < 2 || !chrome.bookmarks || !chrome.history) return [];
  const q = query.toLowerCase();
  const [bookmarks, history] = await Promise.all([
    chrome.bookmarks.search(query).catch(() => []),
    chrome.history.search({ text: query, startTime: 0, maxResults: 40 }).catch(() => []),
  ]);
  const seen = new Set();
  const out = [];
  const add = (url, title, tag, score) => {
    if (!url || !/^https?:/.test(url)) return;
    const key = url.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, title: title || url, tag, score });
  };
  // Prefer matches in the title/host over matches buried in a URL path
  const rel = (url, title) => {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    return ((title || '').toLowerCase().includes(q) ? 2 : 0) + (host.includes(q) ? 3 : 0);
  };
  bookmarks.forEach(b => add(b.url, b.title, 'Bookmark', 100 + rel(b.url, b.title)));
  history.forEach(h => add(h.url, h.title, 'History', Math.min(h.visitCount || 0, 50) + rel(h.url, h.title) * 5));
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

function sendMessage(msg) {
  return new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r); }); }
    catch { resolve(null); }
  });
}

// ─── Dropdown ──────────────────────────────────────────────────────
let items = [];
let activeIndex = -1;
let typedValue = '';
let debounceTimer = null;
let queryToken = 0;

const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

function render(list) {
  const keep = activeIndex >= 0 && activeIndex < list.length ? activeIndex : -1;
  items = list;
  suggestionsBox.innerHTML = '';
  if (!list.length) { hideSuggestions(); return; }

  list.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = `suggestion-item kind-${item.kind}`;

    const icon = document.createElement('span');
    icon.className = 'suggestion-icon';
    if (item.img) {
      const img = document.createElement('img');
      img.src = item.img;
      img.alt = '';
      icon.appendChild(img);
    } else if (item.glyph) {
      icon.textContent = item.glyph;
    } else {
      icon.innerHTML = SEARCH_ICON; // static markup, no user data
    }

    const text = document.createElement('span');
    text.className = 'suggestion-text';
    text.textContent = item.label;
    row.append(icon, text);

    if (item.sub) {
      const sub = document.createElement('span');
      sub.className = 'suggestion-sub';
      sub.textContent = item.sub;
      row.appendChild(sub);
    }

    row.addEventListener('mousedown', e => { e.preventDefault(); item.run(); });
    row.addEventListener('mousemove', () => { if (activeIndex !== i) highlight(i); });
    suggestionsBox.appendChild(row);
  });

  suggestionsBox.classList.remove('hidden');
  highlight(keep);
}

function hideSuggestions() {
  suggestionsBox.classList.add('hidden');
  suggestionsBox.innerHTML = '';
  items = [];
  activeIndex = -1;
}

// Moves the highlight without touching the input (used for hover)
function highlight(index) {
  [...suggestionsBox.children].forEach((el, i) => el.classList.toggle('active', i === index));
  activeIndex = index;
}

// Keyboard selection: Google suggestions fill the input, other rows leave it alone
function setActive(index) {
  highlight(index);
  const item = items[index];
  searchInput.value = item && item.fill !== undefined ? item.fill : typedValue;
}

function answerItem(label, sub) {
  return {
    kind: 'answer',
    glyph: '=',
    label,
    sub: sub || 'Enter to copy',
    run: () => {
      const value = label.includes(' = ') ? label.split(' = ').pop() : label.replace(/^=\s*/, '');
      navigator.clipboard.writeText(value).catch(() => {});
      const row = suggestionsBox.querySelector('.kind-answer .suggestion-sub');
      if (row) row.textContent = 'Copied';
    },
  };
}

function syncItems(text) {
  const out = [];
  const trimmed = text.trim();

  // Bang discovery: typing "!" or "!y" lists matching bangs
  const partial = trimmed.match(/^!([a-z]*)$/i);
  if (partial) {
    Object.entries(BANGS)
      .filter(([k]) => k.startsWith(partial[1].toLowerCase()))
      .slice(0, 8)
      .forEach(([k, b]) => out.push({
        kind: 'bang', glyph: '!', label: `!${k}`, sub: b.name,
        run: () => { searchInput.value = `!${k} `; searchInput.dispatchEvent(new Event('input')); },
      }));
    return out;
  }

  const b = parseBang(trimmed);
  if (b) {
    out.push({
      kind: 'bang', glyph: '↗',
      label: b.query ? `Search ${b.bang.name} for "${b.query}"` : `Open ${b.bang.name}`,
      sub: `!${b.key}`,
      run: () => { window.location.href = bangUrl(b); },
    });
    return out;
  }

  const unit = convertUnits(trimmed);
  if (unit) out.push(answerItem(unit));
  else {
    const v = calc(trimmed);
    if (v !== null) out.push(answerItem(`= ${fmtNum(v)}`));
  }
  return out;
}

async function update(text) {
  const token = ++queryToken;
  const sync = syncItems(text);
  render(sync);

  const trimmed = text.trim();
  if (/^!([a-z]*)$/i.test(trimmed)) return; // bang list only

  const b = parseBang(trimmed);
  const googleQuery = b ? b.query : trimmed;
  const wantsAnswerOnly = sync.some(i => i.kind === 'answer');

  const [fx, local, google] = await Promise.all([
    b || wantsAnswerOnly ? null : convertCurrency(trimmed).catch(() => null),
    b ? [] : localResults(trimmed).catch(() => []),
    googleQuery ? sendMessage({ type: 'SUGGEST', query: googleQuery }) : null,
  ]);
  if (token !== queryToken) return; // user kept typing

  const list = [...sync];
  if (fx) list.push(answerItem(fx.label, fx.sub));

  local.forEach(r => {
    let host = r.url;
    try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch {}
    list.push({
      kind: 'local', img: faviconUrl(r.url), label: r.title, sub: `${r.tag} · ${host}`,
      run: () => { window.location.href = r.url; },
    });
  });

  const suggestions = google && google.ok ? google.suggestions : [];
  suggestions
    .filter(s => !s.startsWith('=') && s.toLowerCase() !== googleQuery.toLowerCase())
    .slice(0, list.length > 2 ? 4 : 6)
    .forEach(s => {
      const full = b ? `!${b.key} ${s}` : s;
      list.push({
        kind: 'suggest', label: s, fill: full,
        run: () => { searchInput.value = full; hideSuggestions(); navigate(full); },
      });
    });

  render(list);
}

searchInput.addEventListener('input', () => {
  typedValue = searchInput.value;
  clearTimeout(debounceTimer);
  if (!typedValue.trim()) { queryToken++; hideSuggestions(); return; }
  // Instant answers render right away; network lookups wait for a short pause
  render(syncItems(typedValue));
  debounceTimer = setTimeout(() => update(typedValue), 120);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const item = items[activeIndex];
    if (item) { item.run(); return; }
    hideSuggestions();
    navigate(searchInput.value);
    return;
  }
  if (suggestionsBox.classList.contains('hidden')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive(Math.min(activeIndex + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive(Math.max(activeIndex - 1, -1));
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    searchInput.value = typedValue;
    hideSuggestions();
  } else if (e.key === 'Tab' && items[0] && items[0].kind === 'bang' && /^!\w*$/.test(typedValue.trim())) {
    e.preventDefault();
    items[Math.max(activeIndex, 0)].run();
  }
});

searchInput.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) update(searchInput.value); });

document.getElementById('search-form').addEventListener('submit', e => e.preventDefault());
