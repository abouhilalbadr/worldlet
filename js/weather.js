// Weather + location helpers (Open-Meteo, no API key needed)

const WMO = {
  0: ['Clear sky', 'clear'],
  1: ['Mainly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'heavyrain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'heavyrain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent showers', 'heavyrain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm, hail', 'storm'],
  99: ['Thunderstorm, hail', 'storm'],
};

export function describe(code) {
  const d = WMO[code] || ['Unknown', 'cloudy'];
  return { label: d[0], type: d[1] };
}

// Scene parameters for each weather type
export const WEATHER_PRESETS = {
  clear:     { clouds: 0.15, overcast: 0.0,  rain: 0,   snow: 0,   fog: 0,   storm: 0 },
  partly:    { clouds: 0.5,  overcast: 0.15, rain: 0,   snow: 0,   fog: 0,   storm: 0 },
  cloudy:    { clouds: 0.95, overcast: 0.55, rain: 0,   snow: 0,   fog: 0,   storm: 0 },
  fog:       { clouds: 0.5,  overcast: 0.5,  rain: 0,   snow: 0,   fog: 1,   storm: 0 },
  drizzle:   { clouds: 0.85, overcast: 0.5,  rain: 0.3, snow: 0,   fog: 0.2, storm: 0 },
  rain:      { clouds: 1,    overcast: 0.65, rain: 0.65, snow: 0,  fog: 0.2, storm: 0 },
  heavyrain: { clouds: 1,    overcast: 0.8,  rain: 1,   snow: 0,   fog: 0.35, storm: 0 },
  snow:      { clouds: 0.9,  overcast: 0.68,  rain: 0,   snow: 0.8, fog: 0.25, storm: 0 },
  storm:     { clouds: 1,    overcast: 0.9,  rain: 1,   snow: 0,   fog: 0.3, storm: 1 },
};

async function getJSON(url, timeout = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchWeather(lat, lon) {
  const p = new URLSearchParams({
    // About 1 km of precision is plenty for weather and keeps the exact position private.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: '7',
  });
  const data = await getJSON('https://api.open-meteo.com/v1/forecast?' + p);
  data.fetchedAt = Date.now();
  data.lat = lat;
  data.lon = lon;
  return data;
}

export async function geocode(query) {
  if (!query || query.trim().length < 2) return [];
  const p = new URLSearchParams({ name: query.trim(), count: '6', language: 'en', format: 'json' });
  const data = await getJSON('https://geocoding-api.open-meteo.com/v1/search?' + p);
  return (data.results || []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function reverseGeocode(lat, lon) {
  try {
    const p = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), localityLanguage: 'en' });
    const d = await getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?' + p, 6000);
    return d.city || d.locality || d.principalSubdivision || 'My location';
  } catch {
    return 'My location';
  }
}

export function geolocate(timeout = 7000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      { timeout, maximumAge: 6 * 3600 * 1000 }
    );
  });
}

// "Wall clock" time at the forecast location, as minutes since midnight
export function locationNow(data) {
  const offset = (data && data.utc_offset_seconds) || -new Date().getTimezoneOffset() * 60;
  const d = new Date(Date.now() + offset * 1000);
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60, dateISO: d.toISOString().slice(0, 10) };
}

function hm(iso) {
  // "2026-10-09T07:31" -> minutes
  const t = iso.split('T')[1] || '00:00';
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Returns { p, e }: p = progress of daylight (0 sunrise .. 1 sunset), e = sun elevation (-0.45 .. 1)
export function sunState(data) {
  const now = locationNow(data);
  let rise = 7 * 60, set = 19 * 60;
  if (data && data.daily && data.daily.sunrise) {
    const i = Math.max(0, data.daily.time.indexOf(now.dateISO));
    rise = hm(data.daily.sunrise[i]);
    set = hm(data.daily.sunset[i]);
  }
  const p = (now.minutes - rise) / (set - rise);
  if (p >= 0 && p <= 1) return { p, e: Math.sin(Math.PI * p) };
  const hoursFrom = p < 0 ? (rise - now.minutes) / 60 : (now.minutes - set) / 60;
  return { p, e: -Math.min(0.45, hoursFrom * 0.25) };
}
