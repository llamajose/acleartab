// ─── PACKAGES ──────────────────────────────────────────────────────
// Paste a tracking number: the carrier is worked out from the number's format and
// the row opens that carrier's tracking page. No API, nothing leaves the browser.
(() => {
  const CARRIERS = {
    ups:    { name: 'UPS',     url: n => `https://www.ups.com/track?tracknum=${n}` },
    usps:   { name: 'USPS',    url: n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` },
    fedex:  { name: 'FedEx',   url: n => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
    dhl:    { name: 'DHL',     url: n => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}` },
    amazon: { name: 'Amazon',  url: n => `https://track.amazon.com/tracking/${n}` },
    ontrac: { name: 'OnTrac',  url: n => `https://www.ontrac.com/tracking/?number=${n}` },
    other:  { name: '17TRACK', url: n => `https://t.17track.net/en#nums=${n}` }, // covers almost every carrier
  };
  const MAX_AGE = 60 * 864e5; // forgotten packages clear themselves after 60 days

  const clean = s => String(s).toUpperCase().replace(/[\s-]/g, '');

  // Returns [carrier, strong]. "strong" means the format is distinctive enough to
  // recognise inside the search bar too (plain 10/12/15-digit numbers are not).
  function detect(n) {
    if (/^1Z[0-9A-Z]{16}$/.test(n)) return ['ups', true];
    if (/^TBA\d{9,}$/.test(n)) return ['amazon', true];
    if (/^(1LS|LX)[0-9A-Z]{8,}$/.test(n) || /^[CD]\d{14}$/.test(n)) return ['ontrac', true];
    if (/^[A-Z]{2}\d{9}US$/.test(n)) return ['usps', true];                // international mail
    if (/^(420\d{5}(\d{4})?)?9[1-5]\d{18,24}$/.test(n)) return ['usps', true]; // IMpb, with or without ZIP prefix
    if (/^96\d{20}$/.test(n)) return ['fedex', true];                      // FedEx Ground 22-digit
    if (/^JJD\d{18}$|^JVGL\d{6,}$/.test(n)) return ['dhl', true];
    if (/^\d{12}$|^\d{15}$/.test(n)) return ['fedex', false];
    if (/^\d{10}$/.test(n)) return ['dhl', false];
    if (/^\d{20}$/.test(n)) return ['usps', false];                       // e.g. certified mail
    return ['other', false];
  }

  const carrierOf = p => CARRIERS[p.carrier] || CARRIERS.other;
  const trackUrl = p => carrierOf(p).url(encodeURIComponent(p.number));

  const widget = document.getElementById('pkg-widget');
  const list = document.getElementById('pkg-list');
  const form = document.getElementById('pkg-add');
  const numInput = document.getElementById('pkg-number');
  const nameInput = document.getElementById('pkg-name');
  const detectChip = document.getElementById('pkg-detect');
  const countEl = document.getElementById('pkg-count');
  const collapseBtn = document.getElementById('pkg-collapse');
  let packages = [];
  let collapsed = false;

  function node(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function addedLabel(ms) {
    const days = Math.floor((Date.now() - ms) / 864e5);
    return days < 1 ? 'Added today' : days === 1 ? 'Added yesterday' : `Added ${days}d ago`;
  }

  function save() { chrome.storage.local.set({ packages }); }

  function render() {
    list.innerHTML = '';
    countEl.textContent = packages.length ? String(packages.length) : '';
    packages.forEach(p => {
      const c = carrierOf(p);
      const li = node('li', 'pkg-item');
      const a = node('a', 'pkg-link');
      a.href = trackUrl(p);
      a.title = `Track on ${c.name}`;
      a.appendChild(node('span', `pkg-carrier c-${p.carrier}`, c.name));
      const body = node('span', 'pkg-body');
      body.appendChild(node('span', 'pkg-name', p.name || p.number));
      body.appendChild(node('span', 'pkg-meta', p.name ? `…${p.number.slice(-6)} · ${addedLabel(p.added)}` : addedLabel(p.added)));
      a.appendChild(body);
      li.appendChild(a);
      const done = node('button', 'pkg-remove', '✓');
      done.type = 'button';
      done.title = 'Arrived: remove';
      done.addEventListener('click', () => remove(p.id));
      li.appendChild(done);
      list.appendChild(li);
    });
  }

  function add(raw, name = '') {
    const number = clean(raw);
    if (!/^[0-9A-Z]{8,40}$/.test(number)) return 'invalid';
    if (packages.some(p => p.number === number)) return 'duplicate';
    packages.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      number,
      name: String(name).trim().slice(0, 40),
      carrier: detect(number)[0],
      added: Date.now(),
    });
    save();
    render();
    if (collapsed) setCollapsed(false);
    return 'ok';
  }

  function remove(id) {
    packages = packages.filter(p => p.id !== id);
    save();
    render();
  }

  function flash(input) {
    input.classList.add('invalid');
    setTimeout(() => input.classList.remove('invalid'), 1200);
  }

  function updateDetect() {
    const n = clean(numInput.value);
    form.classList.toggle('has-number', n.length > 0);
    if (n.length < 8) { detectChip.classList.add('hidden'); return; }
    const [carrier] = detect(n);
    detectChip.className = `pkg-carrier pkg-detect c-${carrier}`;
    detectChip.textContent = CARRIERS[carrier].name;
  }

  numInput.addEventListener('input', updateDetect);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = add(numInput.value, nameInput.value);
    if (result !== 'ok') { flash(numInput); numInput.select(); return; }
    numInput.value = '';
    nameInput.value = '';
    updateDetect();
  });
  // Enter in the number field jumps to the name field first
  numInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !nameInput.value && clean(numInput.value).length >= 8) {
      e.preventDefault();
      nameInput.focus();
    }
  });

  function setCollapsed(on) {
    collapsed = !!on;
    widget.classList.toggle('collapsed', collapsed);
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.title = collapsed ? 'Expand' : 'Minimize';
  }
  collapseBtn.addEventListener('click', () => {
    setCollapsed(!collapsed);
    chrome.storage.local.set({ pkgCollapsed: collapsed });
  });

  // Used by the search bar: pasting a tracking number there offers to track or save it
  window.acleartabPackages = {
    match(text) {
      const n = clean(text);
      if (n.length < 8 || /[^0-9A-Z]/.test(n)) return null;
      const [carrier, strong] = detect(n);
      if (!strong) return null;
      return { number: n, carrierName: CARRIERS[carrier].name, url: CARRIERS[carrier].url(encodeURIComponent(n)) };
    },
    add: (n, name) => add(n, name),
  };

  chrome.storage.local.get(['packages', 'pkgCollapsed']).then((s) => {
    const all = Array.isArray(s.packages) ? s.packages : [];
    packages = all.filter(p => p && p.number && Date.now() - p.added < MAX_AGE);
    if (packages.length !== all.length) save();
    setCollapsed(s.pkgCollapsed);
    render();
  });
})();
