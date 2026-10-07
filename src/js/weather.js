const WEATHER_CACHE_MS = 30 * 60 * 1000;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// wttr.in descriptions vary in case ("Partly cloudy", "Patchy rain nearby"), so match lowercased.
function weatherEmoji(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('thunder')) return '⛈️';
  if (/(snow|sleet|blizzard|ice pellets)/.test(d)) return '❄️';
  if (/(rain|drizzle|shower)/.test(d)) return '🌧️';
  if (/(fog|mist|haze)/.test(d)) return '🌫️';
  if (d.includes('overcast')) return '☁️';
  if (d.includes('partly')) return '⛅';
  if (d.includes('cloud')) return '☁️';
  if (/(sunny|clear)/.test(d)) return '☀️';
  return '🌤️';
}

function wttrUrl(loc) {
  const path = loc ? encodeURIComponent(loc).replace(/%20/g, '+') : '';
  return `https://wttr.in/${path}?format=j1`;
}

async function getWeather(force = false) {
  const el = document.getElementById('weather-widget');
  const store = await chrome.storage.local.get(['weather', 'time', 'unit', 'weatherLoc', 'weatherFor']);
  const isF = store.unit !== 'C';
  const loc = (store.weatherLoc || '').trim();
  const cacheValid = store.weather && store.time
    && Date.now() - store.time < WEATHER_CACHE_MS
    && (store.weatherFor || '') === loc;

  if (!force && cacheValid) { showWeather(store.weather, isF); return; }

  try {
    const res = await fetch(wttrUrl(loc));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await chrome.storage.local.set({ weather: data, time: Date.now(), weatherFor: loc });
    showWeather(data, isF);
  } catch (err) {
    // Fall back to stale data for the same location rather than an empty box.
    if (store.weather && (store.weatherFor || '') === loc) {
      showWeather(store.weather, isF, true);
    } else {
      el.innerHTML = '<div class="wx-loading">Weather unavailable</div>';
    }
  }
}

function showWeather(data, isF, stale = false) {
  const el = document.getElementById('weather-widget');
  try {
    const u = isF ? 'F' : 'C';
    const cur = data.current_condition[0];
    const desc = cur.weatherDesc[0].value.trim();
    const area = data.nearest_area && data.nearest_area[0];
    const place = area ? area.areaName[0].value : '';
    const today = data.weather[0];

    const days = data.weather.slice(1, 3).map(d => {
      const name = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
      const icon = weatherEmoji(d.hourly[4].weatherDesc[0].value);
      return `<div class="wx-day">
        <span class="wx-dname">${esc(name)}</span>
        <span class="wx-dicon">${icon}</span>
        <span class="wx-range">${esc(d['maxtemp' + u])}° <span class="wx-low">${esc(d['mintemp' + u])}°</span></span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="wx-place">${esc(place)}${stale ? ' · offline' : ''}</div>
      <div class="wx-now">
        <span class="wx-temp">${esc(cur['temp_' + u])}°</span>
        <span class="wx-icon">${weatherEmoji(desc)}</span>
      </div>
      <div class="wx-desc">${esc(desc)} · H ${esc(today['maxtemp' + u])}° L ${esc(today['mintemp' + u])}°</div>
      <div class="wx-days">${days}</div>
    `;
  } catch (e) {
    el.innerHTML = '<div class="wx-loading">Weather unavailable</div>';
  }
}

getWeather();
