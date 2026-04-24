// --- 1. CLOCK ---
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('clock').innerText = `${hours}:${minutes}:${seconds}`;
  
  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('date').innerText = now.toLocaleDateString(undefined, dateOptions);
}
updateClock();
setInterval(updateClock, 1000);

// --- 2. SMART SEARCH ---
function navigate(text) {
  text = text.trim();
  if (!text) return;
  const isIP = /^\d{1,3}(\.\d{1,3}){3}/.test(text);
  const hasSpaces = text.includes(' ');
  const hasDot = text.includes('.');
  if (!hasSpaces && (text.startsWith('http://') || text.startsWith('https://'))) {
    window.location.href = text;
  } else if (!hasSpaces && (text.startsWith('localhost') || isIP)) {
    window.location.href = `http://${text}`;
  } else if (!hasSpaces && hasDot) {
    window.location.href = `https://${text}`;
  } else {
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }
}

document.getElementById('search-form').addEventListener('submit', function(e) {
  e.preventDefault();
  hideSuggestions();
  navigate(document.getElementById('search-input').value);
});

// --- 2b. AUTOCOMPLETE ---
const searchInput = document.getElementById('search-input');
const suggestionsBox = document.getElementById('search-suggestions');
let suggestionItems = [];
let activeIndex = -1;
let typedValue = '';
let debounceTimer = null;

function showSuggestions(items) {
  suggestionsBox.innerHTML = '';
  if (!items.length) { hideSuggestions(); return; }
  items.forEach((text, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `<span class="suggestion-icon">↗</span><span class="suggestion-text">${text}</span>`;
    div.addEventListener('mousedown', (e) => {
      // mousedown fires before blur so we can act before dropdown hides
      e.preventDefault();
      searchInput.value = text;
      hideSuggestions();
      navigate(text);
    });
    suggestionsBox.appendChild(div);
  });
  suggestionItems = suggestionsBox.querySelectorAll('.suggestion-item');
  activeIndex = -1;
  suggestionsBox.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionsBox.classList.add('hidden');
  suggestionsBox.innerHTML = '';
  suggestionItems = [];
  activeIndex = -1;
}

function setActive(index) {
  suggestionItems.forEach(el => el.classList.remove('active'));
  if (index >= 0 && index < suggestionItems.length) {
    suggestionItems[index].classList.add('active');
    searchInput.value = suggestionItems[index].querySelector('.suggestion-text').textContent;
  } else {
    searchInput.value = typedValue;
  }
  activeIndex = index;
}

function fetchSuggestions(query) {
  if (!query) { hideSuggestions(); return; }
  chrome.runtime.sendMessage({ type: 'SUGGEST', query }, (response) => {
    if (response && response.ok && response.suggestions.length) {
      showSuggestions(response.suggestions);
    } else {
      hideSuggestions();
    }
  });
}

searchInput.addEventListener('input', () => {
  typedValue = searchInput.value;
  clearTimeout(debounceTimer);
  if (!typedValue.trim()) { hideSuggestions(); return; }
  debounceTimer = setTimeout(() => fetchSuggestions(typedValue), 150);
});

searchInput.addEventListener('keydown', (e) => {
  if (suggestionsBox.classList.contains('hidden')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive(Math.min(activeIndex + 1, suggestionItems.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive(Math.max(activeIndex - 1, -1));
  } else if (e.key === 'Escape') {
    searchInput.value = typedValue;
    hideSuggestions();
  }
});

searchInput.addEventListener('blur', () => {
  // Small delay so mousedown on suggestion fires first
  setTimeout(hideSuggestions, 150);
});

// --- 3. SETTINGS & BACKGROUND ---
const bgContainer = document.getElementById('bg-container');
const gearIcon = document.getElementById('gear-icon');
const settingsPanel = document.getElementById('settings-panel');

gearIcon.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

document.getElementById('settings-close').addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

function setMedia(dataUrl, type) {
  const style = "position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; will-change:transform; z-index:-2;";
  if (type && type.startsWith('video')) {
    bgContainer.innerHTML = `<video src="${dataUrl}" autoplay loop muted style="${style}"></video>`;
  } else {
    bgContainer.innerHTML = `<img src="${dataUrl}" style="${style}">`;
  }
}

document.getElementById('bg-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    const type = file.type;
    chrome.storage.local.set({ savedBg: dataUrl, bgType: type });
    setMedia(dataUrl, type);
  };
  reader.readAsDataURL(file);
});

document.getElementById('reset-bg').addEventListener('click', () => {
  chrome.storage.local.remove(['savedBg', 'bgType']);
  bgContainer.innerHTML = ''; 
});

document.getElementById('temp-unit').addEventListener('change', (e) => {
  chrome.storage.local.set({ unit: e.target.value });
  if (typeof getWeather === 'function') getWeather(); 
});

// --- 4. QUICK LINKS ---
let quickLinks = [];

function renderLinks() {
  const container = document.getElementById('quick-links');
  const select = document.getElementById('delete-link-select');
  container.innerHTML = '';
  select.innerHTML = '';

  quickLinks.forEach((link, index) => {
    const a = document.createElement('a');
    a.href = link.url.startsWith('http') ? link.url : `https://${link.url}`;
    a.className = 'quick-link-item';
    a.title = link.name;
    const domain = new URL(a.href).hostname;
    a.innerHTML = `<img src="https://www.google.com/s2/favicons?sz=128&domain=${domain}" alt="icon">`;
    container.appendChild(a);

    const option = document.createElement('option');
    option.value = index;
    option.innerText = link.name;
    select.appendChild(option);
  });
}

document.getElementById('add-link-btn').addEventListener('click', () => {
  const name = document.getElementById('link-name').value.trim();
  const url = document.getElementById('link-url').value.trim();
  if (name && url) {
    quickLinks.push({ name, url });
    chrome.storage.local.set({ quickLinks });
    renderLinks();
    document.getElementById('link-name').value = '';
    document.getElementById('link-url').value = '';
  }
});

document.getElementById('delete-link-btn').addEventListener('click', () => {
  const index = document.getElementById('delete-link-select').value;
  if (index !== '') {
    quickLinks.splice(index, 1);
    chrome.storage.local.set({ quickLinks });
    renderLinks();
  }
});

// --- 5. STARTUP ---
async function init() {
  const store = await chrome.storage.local.get(['savedBg', 'bgType', 'unit', 'quickLinks']);
  if (store.unit) document.getElementById('temp-unit').value = store.unit;
  if (store.savedBg) setMedia(store.savedBg, store.bgType);
  if (store.quickLinks) quickLinks = store.quickLinks;
  renderLinks();
}
init();