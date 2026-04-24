const CACHE_TIME = 30 * 60 * 1000; 

async function getWeather() {
  try {
    const store = await chrome.storage.local.get(['weather', 'time', 'unit']);
    const now = Date.now();
    const isF = store.unit !== 'C'; 

    if (store.weather && store.time && (now - store.time < CACHE_TIME)) {
      showWeather(store.weather, isF);
      return;
    }

    const res = await fetch('https://wttr.in/?format=j1');
    if (!res.ok) throw new Error('Bad link');
    
    const data = await res.json();
    await chrome.storage.local.set({ weather: data, time: now });
    showWeather(data, isF);

  } catch (err) {
    document.getElementById('weather-widget').innerText = '⚠️ Offline';
  }
}

function getEmoji(text) {
  if (text.includes('Rain')) return '🌧️';
  if (text.includes('Cloud')) return '☁️';
  if (text.includes('Clear') || text.includes('Sunny')) return '☀️';
  if (text.includes('Snow')) return '❄️';
  return '🌤️';
}

function showWeather(data, isF) {
  try {
    const sym = isF ? '°F' : '°C';
    const cur = data.current_condition[0];
    const tCur = isF ? cur.temp_F : cur.temp_C;
    const emCur = getEmoji(cur.weatherDesc[0].value);

    const d1 = data.weather[1];
    const t1 = isF ? d1.maxtempF : d1.maxtempC;
    const em1 = getEmoji(d1.hourly[4].weatherDesc[0].value);

    const d2 = data.weather[2];
    const t2 = isF ? d2.maxtempF : d2.maxtempC;
    const em2 = getEmoji(d2.hourly[4].weatherDesc[0].value);

    document.getElementById('weather-widget').innerHTML = `
      <div><strong>Now:</strong> ${emCur} ${tCur}${sym}</div>
      <div style="font-size: 0.9rem; opacity: 0.8;">Tmrw: ${em1} ${t1}${sym}</div>
      <div style="font-size: 0.9rem; opacity: 0.8;">Next: ${em2} ${t2}${sym}</div>
    `;
  } catch (e) {
    document.getElementById('weather-widget').innerText = 'Error';
  }
}

getWeather();