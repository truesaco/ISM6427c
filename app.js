(function () {
  'use strict';

  var DEFAULT_PLACE = {
    name: 'Boca Raton, FL (FAU)',
    latitude: 26.3705,
    longitude: -80.1024
  };
  var USER_NAME = 'Alvaro Saco-Vertiz';
  var FIRST_NAME = 'Alvaro';
  var REFRESH_MS = 10 * 60 * 1000;

  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

  // WMO weather interpretation codes -> [label, day icon, night icon]
  var WMO = {
    0: ['Clear sky', '☀️', '🌙'],
    1: ['Mainly clear', '🌤️', '🌙'],
    2: ['Partly cloudy', '⛅', '☁️'],
    3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'],
    48: ['Rime fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'],
    53: ['Drizzle', '🌦️', '🌧️'],
    55: ['Heavy drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'],
    57: ['Freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'],
    63: ['Rain', '🌧️', '🌧️'],
    65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌧️', '🌧️'],
    67: ['Freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'],
    73: ['Snow', '🌨️', '🌨️'],
    75: ['Heavy snow', '❄️', '❄️'],
    77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Rain showers', '🌦️', '🌧️'],
    81: ['Rain showers', '🌧️', '🌧️'],
    82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'],
    86: ['Snow showers', '🌨️', '🌨️'],
    95: ['Thunderstorm', '⛈️', '⛈️'],
    96: ['Thunderstorm, hail', '⛈️', '⛈️'],
    99: ['Thunderstorm, hail', '⛈️', '⛈️']
  };

  function wmo(code, isDay) {
    var w = WMO[code] || ['Unknown', '🌡️', '🌡️'];
    return { label: w[0], icon: isDay === 0 ? w[2] : w[1] };
  }

  // ---------- storage (safe) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    place: load('place', DEFAULT_PLACE),
    units: load('units', 'imperial'),
    timer: null
  };

  // ---------- theme ----------
  function getTheme() {
    try { return localStorage.getItem('theme') || 'system'; } catch (e) { return 'system'; }
  }
  function applyTheme(choice) {
    var root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    try { localStorage.setItem('theme', choice); } catch (e) {}
    document.querySelectorAll('[data-theme-choice]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.themeChoice === choice));
    });
  }
  document.querySelectorAll('[data-theme-choice]').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.dataset.themeChoice); });
  });
  applyTheme(getTheme());

  // ---------- greeting ----------
  function renderGreeting() {
    var h = new Date().getHours();
    var part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = part + ', ' + USER_NAME + '! 👋';
    var visited = load('visited', false);
    $('greeting-sub').textContent = visited
      ? 'Welcome back, ' + FIRST_NAME + '. Go Owls! 🦉 Here\'s your live weather.'
      : 'Welcome to your weather app, ' + FIRST_NAME + '. Go Owls! 🦉';
    save('visited', true);
  }

  // ---------- formatting ----------
  function unitTemp() { return state.units === 'imperial' ? '°F' : '°C'; }
  function unitWind() { return state.units === 'imperial' ? 'mph' : 'km/h'; }
  function round(n) { return n == null || isNaN(n) ? '—' : Math.round(n); }
  function compass(deg) {
    if (deg == null) return '';
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }
  // Open-Meteo returns local times without offset (timezone=auto); parse as wall-clock time.
  function parseLocal(s) {
    var p = s.split(/[-T:]/).map(Number);
    return new Date(p[0], p[1] - 1, p[2], p[3] || 0, p[4] || 0);
  }
  function fmtTime(s) {
    return parseLocal(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function fmtHour(s) {
    return parseLocal(s).toLocaleTimeString([], { hour: 'numeric' });
  }
  function fmtDay(s, i) {
    if (i === 0) return 'Today';
    return parseLocal(s).toLocaleDateString([], { weekday: 'short' });
  }

  function setStatus(msg, isError) {
    var el = $('status');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  // ---------- data ----------
  function fetchWeather() {
    var p = state.place;
    var params = new URLSearchParams({
      latitude: p.latitude,
      longitude: p.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
      timezone: 'auto',
      forecast_days: 7,
      temperature_unit: state.units === 'imperial' ? 'fahrenheit' : 'celsius',
      wind_speed_unit: state.units === 'imperial' ? 'mph' : 'kmh',
      precipitation_unit: state.units === 'imperial' ? 'inch' : 'mm'
    });

    setStatus('Loading live weather…');
    return fetch(FORECAST_URL + '?' + params.toString())
      .then(function (r) {
        if (!r.ok) throw new Error('Weather service returned ' + r.status);
        return r.json();
      })
      .then(function (data) {
        render(data);
        setStatus('');
      })
      .catch(function (err) {
        setStatus('Could not load weather: ' + err.message + '. Retrying soon.', true);
      });
  }

  function render(d) {
    var c = d.current;
    var w = wmo(c.weather_code, c.is_day);
    var t = unitTemp();

    $('place-name').textContent = state.place.name;
    $('updated').textContent = 'Updated ' + fmtTime(c.time) + ' local time';
    $('current-icon').textContent = w.icon;
    $('current-temp').textContent = round(c.temperature_2m) + t;
    $('current-desc').textContent = w.label;
    $('current-hilo').textContent = 'H ' + round(d.daily.temperature_2m_max[0]) + '° · L ' + round(d.daily.temperature_2m_min[0]) + '°';

    $('stat-feels').textContent = round(c.apparent_temperature) + t;
    $('stat-humidity').textContent = round(c.relative_humidity_2m) + '%';
    $('stat-wind').textContent = round(c.wind_speed_10m) + ' ' + unitWind() + ' ' + compass(c.wind_direction_10m);
    $('stat-precip').textContent = round(d.daily.precipitation_probability_max[0]) + '%';
    $('stat-uv').textContent = round(d.daily.uv_index_max[0]);
    $('stat-pressure').textContent = round(c.pressure_msl) + ' hPa';
    $('stat-sunrise').textContent = fmtTime(d.daily.sunrise[0]);
    $('stat-sunset').textContent = fmtTime(d.daily.sunset[0]);

    // Hourly: next 24 hours starting at the current hour.
    var hourly = $('hourly');
    hourly.innerHTML = '';
    var nowHour = c.time.slice(0, 13);
    var start = d.hourly.time.findIndex(function (x) { return x.slice(0, 13) >= nowHour; });
    if (start < 0) start = 0;
    for (var i = start; i < Math.min(start + 24, d.hourly.time.length); i++) {
      var hw = wmo(d.hourly.weather_code[i], d.hourly.is_day[i]);
      var li = document.createElement('li');
      li.innerHTML =
        '<span>' + (i === start ? 'Now' : fmtHour(d.hourly.time[i])) + '</span>' +
        '<span class="h-icon" title="' + hw.label + '">' + hw.icon + '</span>' +
        '<span class="h-temp">' + round(d.hourly.temperature_2m[i]) + '°</span>' +
        '<span class="h-pop">💧' + round(d.hourly.precipitation_probability[i]) + '%</span>';
      hourly.appendChild(li);
    }

    // Daily with range bars scaled to the week's min/max.
    var daily = $('daily');
    daily.innerHTML = '';
    var lows = d.daily.temperature_2m_min, highs = d.daily.temperature_2m_max;
    var weekMin = Math.min.apply(null, lows), weekMax = Math.max.apply(null, highs);
    var span = Math.max(1, weekMax - weekMin);
    d.daily.time.forEach(function (day, j) {
      var dw = wmo(d.daily.weather_code[j], 1);
      var left = ((lows[j] - weekMin) / span) * 100;
      var width = ((highs[j] - lows[j]) / span) * 100;
      var row = document.createElement('li');
      row.innerHTML =
        '<span class="d-day">' + fmtDay(day, j) + '</span>' +
        '<span class="d-icon" title="' + dw.label + '">' + dw.icon + '</span>' +
        '<span class="d-pop">💧' + round(d.daily.precipitation_probability_max[j]) + '%</span>' +
        '<span class="d-range"><span class="d-lo">' + round(lows[j]) + '°</span>' +
        '<span class="bar"><span style="left:' + left + '%;width:' + width + '%"></span></span>' +
        '<span class="d-hi">' + round(highs[j]) + '°</span></span>';
      daily.appendChild(row);
    });

    $('current').hidden = false;
    $('hourly-card').hidden = false;
    $('daily-card').hidden = false;
    renderMap();
  }

  // ---------- map (Leaflet + OpenStreetMap, no key needed) ----------
  var map = null, marker = null;
  function renderMap() {
    if (typeof L === 'undefined') return; // map library failed to load; skip the map.
    var p = state.place;
    var ll = [p.latitude, p.longitude];
    $('map-card').hidden = false;
    $('map-place').textContent = '· ' + p.name;
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false, worldCopyJump: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      marker = L.marker(ll).addTo(map);
      map.setView(ll, 5);
    } else if (map._lastPlace !== p.name + ll.join()) {
      marker.setLatLng(ll);
      map.flyTo(ll, 5, { duration: 1.2 });
    }
    map._lastPlace = p.name + ll.join();
    marker.bindPopup(p.name);
    // The card may have just been un-hidden; let Leaflet re-measure.
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  function setPlace(place) {
    state.place = place;
    save('place', place);
    refresh();
  }

  function refresh() {
    clearInterval(state.timer);
    fetchWeather();
    state.timer = setInterval(fetchWeather, REFRESH_MS);
  }

  // ---------- search ----------
  var input = $('search-input');
  var results = $('search-results');
  var searchTimer = null;
  var searchSeq = 0;

  function closeResults() { results.hidden = true; results.innerHTML = ''; }

  function placeLabel(r) {
    return [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
  }

  function search(q) {
    var seq = ++searchSeq;
    var params = new URLSearchParams({ name: q, count: 6, language: 'en', format: 'json' });
    fetch(GEOCODE_URL + '?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (seq !== searchSeq) return;
        results.innerHTML = '';
        var list = data.results || [];
        if (!list.length) {
          results.innerHTML = '<li aria-disabled="true">No matches found</li>';
        }
        list.forEach(function (r) {
          var li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.innerHTML = '<strong></strong> <small></small>';
          li.querySelector('strong').textContent = r.name;
          li.querySelector('small').textContent = [r.admin1, r.country].filter(Boolean).join(', ');
          li.addEventListener('click', function () {
            setPlace({ name: placeLabel(r), latitude: r.latitude, longitude: r.longitude });
            input.value = '';
            closeResults();
          });
          results.appendChild(li);
        });
        results.hidden = false;
      })
      .catch(function () { if (seq === searchSeq) closeResults(); });
  }

  input.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var q = input.value.trim();
    if (q.length < 2) { closeResults(); return; }
    searchTimer = setTimeout(function () { search(q); }, 250);
  });
  $('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var first = results.querySelector('li[role="option"]');
    if (first) first.click();
  });
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeResults(); });
  document.addEventListener('click', function (e) {
    if (!$('search-form').contains(e.target)) closeResults();
  });

  // ---------- buttons ----------
  $('btn-home').addEventListener('click', function () { setPlace(DEFAULT_PLACE); });

  $('btn-locate').addEventListener('click', function () {
    if (!navigator.geolocation) { setStatus('Geolocation is not supported by this browser.', true); return; }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        setPlace({
          name: 'My location',
          latitude: +pos.coords.latitude.toFixed(4),
          longitude: +pos.coords.longitude.toFixed(4)
        });
      },
      function () { setStatus('Location access was denied or unavailable.', true); },
      { timeout: 10000 }
    );
  });

  var unitButtons = document.querySelectorAll('[data-units]');
  function renderUnitsButton() {
    unitButtons.forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.units === state.units));
    });
  }
  unitButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.units === state.units) return;
      state.units = b.dataset.units;
      save('units', state.units);
      renderUnitsButton();
      refresh();
    });
  });

  // Refresh when the tab becomes visible again so data stays current.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { renderGreeting(); fetchWeather(); }
  });

  // ---------- init ----------
  renderGreeting();
  renderUnitsButton();
  refresh();
})();
