import { describe, WEATHER_PRESETS, fetchWeather, geocode, reverseGeocode, geolocate, sunState } from './weather.js';
import { wxIcon, UI } from './icons.js';
import { SCENE_PROMPT, checkScene } from './custom-scene.js';
import { startWelcome } from './welcome.js';
import { brandFor, brandSVG } from './brand-icons.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- storage ---------------- */
const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const store = {
  async get(area, key, def) {
    try {
      if (hasChrome) {
        const r = await chrome.storage[area].get(key);
        return r[key] ?? def;
      }
      const v = localStorage.getItem(area + ':' + key);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  async set(area, key, val) {
    try {
      if (hasChrome) return await chrome.storage[area].set({ [key]: val });
      localStorage.setItem(area + ':' + key, JSON.stringify(val));
    } catch (e) {
      console.warn('save failed', e);
    }
  },
};

/* ---------------- defaults ---------------- */
const DEFAULT_SETTINGS = {
  name: '',
  logoTint: true,
  scene: 'island',
  photoBlur: 0,
  photoDim: 20,
  engine: 'google',
  units: 'C',
  clock24: true,
  time: 'live',
  weather: 'live',
  season: 'live',
  quality: 'auto',
  autoRotate: true,
  panelsHidden: false,
  location: null,
};

const DEFAULT_LINKS = [
  { name: 'Gmail', url: 'https://mail.google.com/' },
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'Drive', url: 'https://drive.google.com/' },
  { name: 'Calendar', url: 'https://calendar.google.com/' },
  { name: 'Maps', url: 'https://www.google.com/maps' },
  { name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: 'Claude', url: 'https://claude.ai/' },
];

const ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  youtube: 'https://www.youtube.com/results?search_query=',
};

const TIME_PRESETS = {
  morning: { p: 0.07, e: 0.2 },
  day: { p: 0.45, e: 0.95 },
  evening: { p: 0.95, e: 0.12 },
  night: { p: 1.3, e: -0.42 },
};

let settings = { ...DEFAULT_SETTINGS };
let links = [];
let tasks = [];
let wx = null;
let scene = null;
let selectedDay = null;
let hourlyMetric = 'temp';

/* ---------------- helpers ---------------- */
const isF = () => settings.units === 'F';
const T = (c) => (c == null ? '–' : Math.round(isF() ? (c * 9) / 5 + 32 : c));
const W = (k) => (k == null ? '–' : Math.round(isF() ? k * 0.621371 : k));
const wUnit = () => (isF() ? 'mph' : 'km/h');
const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) / 45)) % 8];
const pad = (n) => String(n).padStart(2, '0');

function fmtTime(d) {
  if (settings.clock24) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())}<small>${d.getHours() < 12 ? 'AM' : 'PM'}</small>`;
}
function fmtHM(iso) {
  const [h, m] = iso.split('T')[1].split(':').map(Number);
  if (settings.clock24) return `${pad(h)}:${pad(m)}`;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
function dayName(iso, i) {
  if (i === 0) return 'Today';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

function currentSeason() {
  const m = new Date().getMonth();
  let s = m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  if (settings.location && settings.location.lat < 0) s = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }[s];
  return s;
}

function weatherType() {
  if (settings.weather !== 'live') return settings.weather;
  return wx ? describe(wx.current.weather_code).type : 'partly';
}

function isNightNow() {
  if (settings.time !== 'live') return settings.time === 'night';
  return sunState(wx).e < -0.03;
}

/* ---------------- icons ---------------- */
function paintIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => {
    if (!el.dataset.painted || el.dataset.painted !== el.dataset.icon) {
      el.innerHTML = UI[el.dataset.icon] || '';
      el.dataset.painted = el.dataset.icon;
    }
  });
}

/* ---------------- clock & greeting ---------------- */
function tickClock() {
  const d = new Date();
  $('#clock').innerHTML = fmtTime(d);
  $('#date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = d.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = settings.name ? `${part}, ${settings.name}` : part;
}

/* ---------------- scene ---------------- */
async function initScene() {
  try {
    const { World } = await import('./world.js');
    scene = new World($('#scene'));
    scene.onNightChange = (n) => { if (!photoActive()) document.body.classList.toggle('night', n); };
    scene.setQuality(settings.quality);
    scene.setAutoRotate(settings.autoRotate);
  } catch (e) {
    console.warn('WebGL unavailable', e);
    document.body.classList.add('no-webgl');
    scene = null;
  }
  await loadSceneSet();
  applyScene(true);
}

async function loadSceneSet() {
  const mode = settings.scene || 'island';
  renderSceneExtras();
  if (photoActive()) {
    showPhoto();
    scene?.setPaused(true);
    return;
  }
  hidePhoto();
  if (!scene) return;
  scene.setPaused(false);
  try {
    if (mode === 'custom' && customScene) await scene.setScene('custom', customScene);
    else if (mode === 'custom' || mode === 'photo') await scene.setScene('island'); // nothing uploaded yet
    else await scene.setScene(mode);
  } catch (e) {
    console.warn('Scene failed to load, falling back to the island', e);
    await scene.setScene('island');
  }
}

/* ---------------- photo background & AI scenes ---------------- */
let photo = null; // { url, lum } in chrome.storage.local
let customScene = null; // checked scene description in chrome.storage.local

const photoActive = () => settings.scene === 'photo' && !!photo;

function showPhoto() {
  const el = $('#photoBg');
  el.hidden = false;
  el.style.backgroundImage = `url("${photo.url}")`;
  el.style.filter = settings.photoBlur ? `blur(${settings.photoBlur}px)` : '';
  el.style.setProperty('--dim', String(settings.photoDim / 100));
  document.body.classList.add('photo-mode');
  // Light text on dark photos, dark text on bright ones.
  document.body.classList.toggle('night', photo.lum * (1 - settings.photoDim / 100) < 0.5);
}

function hidePhoto() {
  $('#photoBg').hidden = true;
  if (!document.body.classList.contains('photo-mode')) return;
  document.body.classList.remove('photo-mode');
  document.body.classList.toggle('night', scene?._night ?? isNightNow());
}

function renderSceneExtras() {
  const mode = settings.scene;
  $('#photoSet').hidden = mode !== 'photo';
  $('#aiSet').hidden = mode !== 'custom';
  $('#photoPreview').style.backgroundImage = photo ? `url("${photo.url}")` : '';
  $('#photoBlur').value = settings.photoBlur;
  $('#photoDim').value = settings.photoDim;
  if (mode === 'photo' && !photo) showMsg('#photoMsg', 'Upload a photo to use it as your background.');
  if (mode === 'custom' && !customScene && $('#aiMsg').hidden) showMsg('#aiMsg', 'No AI scene yet, so the island is showing.');
}

async function onPhotoFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return showMsg('#photoMsg', 'Use a JPG, PNG or WebP photo.', 'error');
  try {
    photo = await shrinkImage(file, 2560, 1600, 'image/jpeg', 0.86);
  } catch {
    return showMsg('#photoMsg', 'Could not read that photo. Try another file.', 'error');
  }
  await store.set('local', 'photo', photo);
  showMsg('#photoMsg', '');
  loadSceneSet();
}

async function useSceneText(text, source) {
  let checked;
  try {
    checked = checkScene(text);
  } catch (e) {
    return showMsg('#aiMsg', e.message, 'error');
  }
  customScene = checked;
  await store.set('local', 'customScene', customScene);
  settings.scene = 'custom';
  await store.set('sync', 'settings', settings);
  renderSettings();
  await loadSceneSet();
  showMsg('#aiMsg', `Loaded "${checked.name}" from ${source} (${checked.shapeCount} shapes).`, 'ok');
}

async function copyScenePrompt() {
  try {
    await navigator.clipboard.writeText(SCENE_PROMPT);
    showMsg('#aiMsg', 'Prompt copied. Paste it into your AI assistant and describe your scene on the last line.', 'ok');
  } catch {
    const box = $('#aiInput');
    box.value = SCENE_PROMPT;
    box.select();
    showMsg('#aiMsg', 'Copying was blocked, so the prompt is in the box above. Copy it from there.', '');
  }
}

function applyScene(instant = false) {
  const sun = settings.time === 'live' ? sunState(wx) : TIME_PRESETS[settings.time];
  const type = weatherType();
  const season = settings.season === 'live' ? currentSeason() : settings.season;
  if (scene) {
    scene.setSun(sun, instant);
    scene.setWeather(WEATHER_PRESETS[type] || WEATHER_PRESETS.partly, wx ? wx.current.wind_speed_10m : 12);
    scene.setSeason(season);
  } else if (!photoActive()) {
    document.body.classList.toggle('night', sun.e < -0.03);
  }
  ambience.setWeather(WEATHER_PRESETS[type] || WEATHER_PRESETS.partly, wx ? wx.current.wind_speed_10m : 12);
}

/* ---------------- weather ---------------- */
const CACHE_KEY = 'worldlet:wx';
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}
function writeCache(d) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {}
}

async function loadWeather(force = false) {
  const loc = settings.location;
  if (!loc) return;
  const cached = readCache();
  const sameLoc = cached && Math.abs(cached.lat - loc.lat) < 0.01 && Math.abs(cached.lon - loc.lon) < 0.01;
  if (sameLoc && !wx) { wx = cached; renderWeather(); applyScene(true); }
  if (sameLoc && !force && Date.now() - cached.fetchedAt < 15 * 60 * 1000) return;
  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    wx = data;
    writeCache(data);
    renderWeather();
    applyScene();
  } catch (e) {
    console.warn('weather failed', e);
    if (!wx) {
      $('#cond').textContent = 'Weather unavailable offline';
      $('#footMeta').textContent = 'Could not reach Open-Meteo — retrying soon';
    }
  }
}

function renderWeather() {
  $('#city').textContent = settings.location?.name || '—';
  $('#btnLocationLabel').textContent = settings.location?.name || 'Location';
  if (!wx) return;
  const c = wx.current, d = wx.daily;
  const desc = describe(c.weather_code);
  $('#temp').textContent = T(c.temperature_2m);
  $('#cond').textContent = desc.label;
  $('#hilo').innerHTML = `High <b>${T(d.temperature_2m_max[0])}°</b> · Low <b>${T(d.temperature_2m_min[0])}°</b> · Feels like <b>${T(c.apparent_temperature)}°</b>`;
  $('#wind').textContent = `${W(c.wind_speed_10m)} ${wUnit()}`;
  $('#windDir').textContent = `from ${compass(c.wind_direction_10m || 0)}`;
  $('#precip').textContent = `${(c.precipitation ?? 0).toFixed(1)} mm`;
  $('#precipProb').textContent = `${d.precipitation_probability_max?.[0] ?? 0}% chance today`;
  $('#humidity').textContent = `${c.relative_humidity_2m}%`;
  $('#sunTimes').textContent = `☀ ${fmtHM(d.sunrise[0])} · ☾ ${fmtHM(d.sunset[0])}`;

  const night = isNightNow();
  $('#forecast').innerHTML = d.time
    .map((iso, i) => {
      const t = describe(d.weather_code[i]).type;
      return `<button class="day${selectedDay === i ? ' on' : ''}" data-day="${i}" title="${esc(describe(d.weather_code[i]).label)}">
        <span class="dn">${dayName(iso, i)}</span>
        <span class="di">${wxIcon(t, i === 0 && night)}</span>
        <span class="dt">${T(d.temperature_2m_max[i])}°<span>${T(d.temperature_2m_min[i])}°</span></span>
      </button>`;
    })
    .join('');
  const upd = new Date(wx.fetchedAt);
  $('#footMeta').textContent = `Weather by Open-Meteo · updated ${pad(upd.getHours())}:${pad(upd.getMinutes())}`;
  if (selectedDay != null) renderHourly();
}

/* ---------------- hourly panel ---------------- */
function renderHourly() {
  if (!wx || selectedDay == null) return;
  const iso = wx.daily.time[selectedDay];
  const h = wx.hourly;
  const idx = h.time.map((t, i) => (t.startsWith(iso) ? i : -1)).filter((i) => i >= 0);
  $('#hourlyTitle').textContent = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $$('#hourlySeg button').forEach((b) => b.classList.toggle('on', b.dataset.metric === hourlyMetric));

  // chart
  const W0 = 320, H0 = 112, padX = 8, top = 18, bottom = 18;
  const vals = idx.map((i) => (hourlyMetric === 'temp' ? T(h.temperature_2m[i]) : hourlyMetric === 'wind' ? W(h.wind_speed_10m[i]) : h.precipitation_probability[i] ?? 0));
  const lo = hourlyMetric === 'rain' ? 0 : Math.min(...vals), hi = hourlyMetric === 'rain' ? 100 : Math.max(...vals);
  const span = hi - lo || 1;
  const x = (k) => padX + (k / (vals.length - 1)) * (W0 - padX * 2);
  const y = (v) => top + (1 - (v - lo) / span) * (H0 - top - bottom);
  let svg = `<svg viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="none" style="height:100%">`;
  const col = hourlyMetric === 'rain' ? '#2f86c6' : hourlyMetric === 'wind' ? '#5b8a72' : '#e0894a';
  if (hourlyMetric === 'rain') {
    const bw = (W0 - padX * 2) / vals.length - 2;
    vals.forEach((v, k) => {
      const yy = y(v);
      svg += `<rect x="${(padX + k * ((W0 - padX * 2) / vals.length)).toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H0 - bottom - yy).toFixed(1)}" rx="2" fill="${col}" opacity="${0.35 + (v / 100) * 0.6}"/>`;
    });
  } else {
    const pts = vals.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`);
    svg += `<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>`;
    svg += `<polygon points="${x(0)},${H0 - bottom} ${pts.join(' ')} ${x(vals.length - 1)},${H0 - bottom}" fill="url(#g1)"/>`;
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }
  // now marker
  if (selectedDay === 0) {
    const nowH = new Date(Date.now() + (wx.utc_offset_seconds + new Date().getTimezoneOffset() * 60) * 1000).getHours();
    svg += `<line x1="${x(nowH)}" x2="${x(nowH)}" y1="${top - 6}" y2="${H0 - bottom}" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
  }
  svg += `</svg>`;
  const unit = hourlyMetric === 'temp' ? '°' : hourlyMetric === 'wind' ? ' ' + wUnit() : '%';
  $('#hourlyChart').innerHTML = `<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:var(--muted);margin-bottom:2px"><span>${hourlyMetric === 'temp' ? 'Temperature' : hourlyMetric === 'wind' ? 'Wind speed' : 'Chance of rain'}</span><span>${Math.min(...vals)}${unit} – ${Math.max(...vals)}${unit}</span></div><div style="height:96px">${svg}</div><div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--muted)"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>`;

  // rows every 3h
  const rise = wx.daily.sunrise[selectedDay], set = wx.daily.sunset[selectedDay];
  $('#hourlyList').innerHTML = idx
    .filter((_, k) => k % 3 === 0)
    .map((i) => {
      const t = h.time[i];
      const night = t < rise || t > set;
      const d = describe(h.weather_code[i]);
      return `<div class="hour" title="${esc(d.label)}">
        <span>${fmtHM(t)}</span>
        <span class="hi">${wxIcon(d.type, night)}</span>
        <span class="ht">${T(h.temperature_2m[i])}°</span>
        <span class="hs">${W(h.wind_speed_10m[i])} ${wUnit()}</span>
        <span class="hp">${h.precipitation_probability[i] ?? 0}%</span>
      </div>`;
    })
    .join('');
}

/* ---------------- panels ---------------- */
const PANELS = ['hourlyPanel', 'settingsPanel', 'locationPanel'];
function openPanel(id) {
  PANELS.forEach((p) => ($('#' + p).hidden = p !== id));
  paintIcons($('#' + id));
}
function closePanels() {
  PANELS.forEach((p) => ($('#' + p).hidden = true));
  if (selectedDay != null) { selectedDay = null; renderWeather(); }
}
function togglePanel(id) {
  if ($('#' + id).hidden) openPanel(id);
  else closePanels();
}

/* ---------------- location ---------------- */
async function setLocation(loc) {
  settings.location = loc;
  await store.set('sync', 'settings', settings);
  wx = null;
  renderWeather();
  $('#cond').textContent = 'Loading weather…';
  await loadWeather(true);
}

async function useMyLocation() {
  $('#btnLocationLabel').textContent = 'Locating…';
  try {
    const p = await geolocate();
    const name = await reverseGeocode(p.lat, p.lon);
    await setLocation({ name, lat: p.lat, lon: p.lon, auto: true });
  } catch {
    $('#btnLocationLabel').textContent = settings.location?.name || 'Location';
    openPanel('locationPanel');
    $('#locResults').innerHTML = `<li class="muted">Couldn't get your position — search for your city instead.</li>`;
    $('#locInput').focus();
  }
}

let geoTimer;
function onLocInput() {
  clearTimeout(geoTimer);
  const q = $('#locInput').value;
  geoTimer = setTimeout(async () => {
    if (q.trim().length < 2) { $('#locResults').innerHTML = ''; return; }
    try {
      const res = await geocode(q);
      $('#locResults').innerHTML = res.length
        ? res.map((r, i) => `<li data-i="${i}">${esc(r.name)}<small>${esc(r.region)}</small></li>`).join('')
        : `<li class="muted">No places found</li>`;
      $$('#locResults li[data-i]').forEach((li) =>
        li.addEventListener('click', () => {
          const r = res[+li.dataset.i];
          closePanels();
          $('#locInput').value = '';
          $('#locResults').innerHTML = '';
          setLocation({ name: r.name, lat: r.lat, lon: r.lon, auto: false });
        })
      );
    } catch {
      $('#locResults').innerHTML = `<li class="muted">Search unavailable right now</li>`;
    }
  }, 280);
}

/* ---------------- settings panel ---------------- */
function renderSettings() {
  $$('#settingsPanel .chips[data-options]').forEach((wrap) => {
    const key = wrap.dataset.setting;
    const opts = wrap.dataset.options.split(',').map((o) => o.split(':'));
    wrap.innerHTML = opts
      .map(([v, label]) => `<button class="chip${String(settings[key]) === v ? ' on' : ''}" data-v="${v}">${esc(label)}</button>`)
      .join('');
    $$('button', wrap).forEach((b) =>
      b.addEventListener('click', async () => {
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        settings[key] = v;
        await store.set('sync', 'settings', settings);
        renderSettings();
        onSettingChanged(key);
      })
    );
  });
  $('#setName').value = settings.name || '';
  renderLogo();
}

function onSettingChanged(key) {
  if (['time', 'weather', 'season'].includes(key)) applyScene();
  if (key === 'scene') loadSceneSet();
  if (key === 'quality' && scene) scene.setQuality(settings.quality);
  if (key === 'autoRotate' && scene) scene.setAutoRotate(settings.autoRotate);
  if (key === 'units' || key === 'clock24') { renderWeather(); tickClock(); }
  if (key === 'name') tickClock();
  if (key === 'logoTint') renderLogo();
}

/* ---------------- logo ---------------- */
const LOGO_MAX_BYTES = 1024 * 1024;
let customLogo = null; // data URL kept in chrome.storage.local (too big for sync)

function renderLogo() {
  const img = $('#brandCustom');
  const def = $('#brandDefault');
  img.hidden = !customLogo;
  def.hidden = !!customLogo;
  if (customLogo) img.src = customLogo;
  img.classList.toggle('tint-logo', !!settings.logoTint);

  const prev = $('#logoPreview');
  if (customLogo) {
    prev.innerHTML = '';
    const p = document.createElement('img');
    p.src = customLogo;
    p.alt = '';
    p.classList.toggle('tint-logo', !!settings.logoTint);
    prev.append(p);
  } else {
    const svg = def.querySelector('svg').cloneNode(true);
    svg.removeAttribute('class');
    prev.replaceChildren(svg);
  }
  $('#logoReset').hidden = !customLogo;
  $('[data-setting="logoTint"]').hidden = !customLogo;
}

function logoMessage(text, isError = false) {
  showMsg('#logoMsg', text, isError ? 'error' : '');
}

// Inline status under a control. kind: 'error' (red, shakes), 'ok' (green) or '' (plain hint).
function showMsg(sel, text, kind = '') {
  const m = $(sel);
  const isError = kind === 'error';
  m.classList.toggle('ok', kind === 'ok');
  m.textContent = text || '';
  m.hidden = !text;
  m.classList.toggle('error', isError);
  if (isError) {
    // Restart the shake so repeated errors are still noticeable.
    m.classList.remove('shake');
    void m.offsetWidth;
    m.classList.add('shake');
  }
}

async function onLogoFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\/(svg\+xml|png|jpeg|webp)$/.test(file.type)) return logoMessage('Use an SVG, PNG, JPG or WebP image.', true);
  try {
    // Small SVGs stay vector; anything else is downscaled so large photos and exports just work.
    customLogo = file.type === 'image/svg+xml' && file.size <= LOGO_MAX_BYTES ? await readAsDataURL(file) : (await shrinkImage(file, 800, 240, 'image/png')).url;
  } catch {
    return logoMessage('Could not read that image. Try another file.', true);
  }
  await store.set('local', 'logo', customLogo);
  logoMessage('');
  renderLogo();
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Fit the image in maxW x maxH and re-encode it. Also returns the average brightness (0-1).
// Logos use 800x240 PNG (shown 40px tall, sharp on retina); photos use a large JPEG.
async function shrinkImage(file, maxW, maxH, type, quality) {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w0 = img.naturalWidth || 240, h0 = img.naturalHeight || 240;
    const k = Math.min(1, maxW / w0, maxH / h0);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const s = document.createElement('canvas');
    s.width = s.height = 24;
    const sx = s.getContext('2d', { willReadFrequently: true });
    sx.drawImage(img, 0, 0, 24, 24);
    const d = sx.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return { url: c.toDataURL(type, quality), lum: sum / (d.length / 4) };
  } finally {
    URL.revokeObjectURL(src);
  }
}

/* ---------------- links ---------------- */
let editingLinks = false;
let editIndex = -1;

function faviconURL(url) {
  if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)) return null;
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', url);
  u.searchParams.set('size', '64');
  return u.toString();
}

function renderLinks() {
  const wrap = $('#links');
  wrap.classList.toggle('editing', editingLinks);
  $('#btnEditLinks').classList.toggle('on', editingLinks);
  $('#btnEditLinks span:last-child').textContent = editingLinks ? 'Done' : 'Edit';
  let html = links
    .map((l, i) => {
      const brand = brandFor(l.url);
      const fav = faviconURL(l.url);
      const letter = esc((l.name || '?').trim()[0]?.toUpperCase() || '?');
      const icon = brand ? brandSVG(brand) : fav ? `<img src="${esc(fav)}" alt="" />` : `<span class="letter">${letter}</span>`;
      return `<a class="link" href="${esc(l.url)}" data-i="${i}" draggable="${editingLinks}" title="${esc(l.url)}">
        <span class="fav">${icon}</span>
        <span class="name">${esc(l.name)}</span>
        <span class="del" data-del="${i}" title="Remove">${UI.close}</span>
      </a>`;
    })
    .join('');
  if (editingLinks) html += `<button class="link add" id="addLink"><span class="fav"><span>${UI.plus}</span></span><span class="name">Add</span></button>`;
  wrap.innerHTML = html;

  $$('.link[data-i]', wrap).forEach((a) => {
    a.addEventListener('click', (e) => {
      const i = +a.dataset.i;
      if (e.target.closest('[data-del]')) {
        e.preventDefault();
        links.splice(i, 1);
        saveLinks();
        return;
      }
      if (editingLinks) {
        e.preventDefault();
        openLinkForm(i);
        return;
      }
      const url = links[i].url;
      if (/^(chrome|edge|about):/i.test(url) && typeof chrome !== 'undefined' && chrome.tabs) {
        e.preventDefault();
        chrome.tabs.update({ url });
      }
    });
    a.addEventListener('dragstart', (e) => { a.classList.add('dragging'); e.dataTransfer.setData('text/plain', a.dataset.i); });
    a.addEventListener('dragend', () => a.classList.remove('dragging'));
    a.addEventListener('dragover', (e) => editingLinks && e.preventDefault());
    a.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = +e.dataTransfer.getData('text/plain'), to = +a.dataset.i;
      if (Number.isNaN(from) || from === to) return;
      const [m] = links.splice(from, 1);
      links.splice(to, 0, m);
      saveLinks();
    });
  });
  $$('.link .fav img', wrap).forEach((img) => {
    const check = () => {
      const lum = iconLuminance(img);
      const fav = img.closest('.fav');
      fav.classList.toggle('on-dark', lum > 225);
      fav.classList.toggle('on-light', lum >= 0 && lum < 40);
    };
    if (img.complete) check();
    else img.addEventListener('load', check, { once: true });
  });
  const add = $('#addLink');
  if (add) add.addEventListener('click', () => openLinkForm(-1));
}

// Some favicons are plain white (e.g. GitHub in dark mode) or plain black and vanish on a
// tile of the same tone. Average the luminance of the visible pixels (-1 if unknown).
function iconLuminance(img) {
  try {
    const n = 16;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    let sum = 0, count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      count++;
    }
    return count > 0 ? sum / count : -1;
  } catch {
    return -1;
  }
}

function openLinkForm(i) {
  editIndex = i;
  $('#linkForm').hidden = false;
  $('#linkName').value = i >= 0 ? links[i].name : '';
  $('#linkUrl').value = i >= 0 ? links[i].url : '';
  $('#linkName').focus();
}

async function saveLinks() {
  await store.set('sync', 'links', links);
  renderLinks();
}

/* ---------------- tasks ---------------- */
function renderTasks() {
  const ul = $('#tasks');
  if (!tasks.length) {
    ul.innerHTML = `<li class="empty">Nothing on the list. Enjoy the view.</li>`;
  } else {
    ul.innerHTML = tasks
      .map((t, i) => `<li class="${t.done ? 'done' : ''}" data-i="${i}"><button class="tick" data-act="tick">${UI.check}</button><span class="txt">${esc(t.text)}</span><button class="x" data-act="del" title="Delete">${UI.close}</button></li>`)
      .join('');
  }
  const open = tasks.filter((t) => !t.done).length;
  $('#taskCount').textContent = open ? `· ${open}` : '';
  $('#clearDone').hidden = !tasks.some((t) => t.done);
}
async function saveTasks() {
  await store.set('local', 'tasks', tasks);
  renderTasks();
}

/* ---------------- timer ---------------- */
let timer = { duration: 25 * 60, remaining: 25 * 60, endAt: null, label: 'Focus' };
let timerInt;
function timerLeft() {
  return timer.endAt ? Math.max(0, Math.round((timer.endAt - Date.now()) / 1000)) : timer.remaining;
}
function renderTimer() {
  const s = timerLeft();
  $('#timerDisplay').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  $('#timerLabel').textContent = timer.endAt ? `${timer.label} · running` : timer.label;
  const btn = $('#timerStart [data-icon]');
  btn.dataset.icon = timer.endAt ? 'pause' : 'play';
  paintIcons($('#timerStart'));
  $$('[data-preset]').forEach((b) => b.classList.toggle('on', +b.dataset.preset * 60 === timer.duration));
  if (timer.endAt) document.title = `${pad(Math.floor(s / 60))}:${pad(s % 60)} · ${timer.label}`;
  else if (!document.title.startsWith('⏰')) document.title = 'New Tab';
  if (timer.endAt && s === 0) finishTimer();
}
function runTimerLoop() {
  clearInterval(timerInt);
  if (timer.endAt) timerInt = setInterval(renderTimer, 250);
  renderTimer();
}
async function saveTimer() {
  await store.set('local', 'timer', timer);
}
function finishTimer() {
  timer.endAt = null;
  timer.remaining = timer.duration;
  saveTimer();
  clearInterval(timerInt);
  chime();
  document.title = '⏰ Time’s up!';
  setTimeout(() => (document.title = 'New Tab'), 8000);
  renderTimer();
}
function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = [660, 880, 1046][i];
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.65);
    });
  } catch {}
}

/* ---------------- ambience ---------------- */
class Ambience {
  constructor() { this.on = false; this.weather = WEATHER_PRESETS.partly; this.wind = 10; }
  noise(ctx, brown) {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    return s;
  }
  start() {
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // waves
    const waves = this.noise(ctx, true), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
    this.waveGain = ctx.createGain(); this.waveGain.gain.value = 0.35;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.085; lfoG.gain.value = 0.22;
    lfo.connect(lfoG).connect(this.waveGain.gain);
    waves.connect(lp).connect(this.waveGain).connect(this.master);
    // rain
    const rain = this.noise(ctx, false), hp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900; bp.type = 'lowpass'; bp.frequency.value = 6000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(hp).connect(bp).connect(this.rainGain).connect(this.master);
    // wind
    const wind = this.noise(ctx, false), wf = ctx.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wl = ctx.createOscillator(), wlg = ctx.createGain();
    wl.frequency.value = 0.13; wlg.gain.value = 180; wl.connect(wlg).connect(wf.frequency);
    wind.connect(wf).connect(this.windGain).connect(this.master);
    [waves, rain, wind, lfo, wl].forEach((n) => n.start());
    this.master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.8);
    this.on = true;
    this.update();
  }
  stop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => ctx.close(), 1200);
    this.ctx = null;
    this.on = false;
  }
  setWeather(w, wind) { this.weather = w; this.wind = wind; this.update(); }
  update() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(this.weather.rain * 0.09, t, 1.2);
    this.windGain.gain.setTargetAtTime(Math.min(1, this.wind / 45) * 0.12, t, 1.2);
  }
}
const ambience = new Ambience();

/* ---------------- search ---------------- */
function go(q) {
  q = q.trim();
  if (!q) return;
  const looksUrl = !/\s/.test(q) && (/^https?:\/\//i.test(q) || /^localhost(:\d+)?(\/|$)/i.test(q) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(q));
  if (looksUrl) {
    location.href = /^https?:\/\//i.test(q) ? q : 'https://' + q;
  } else {
    location.href = (ENGINES[settings.engine] || ENGINES.google) + encodeURIComponent(q);
  }
}

/* ---------------- events ---------------- */
function bind() {
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); go($('#searchInput').value); });

  $('#btnLocation').addEventListener('click', () => { togglePanel('locationPanel'); if (!$('#locationPanel').hidden) $('#locInput').focus(); });
  $('#btnLocate').addEventListener('click', useMyLocation);
  $('#locUseMine').addEventListener('click', () => { closePanels(); useMyLocation(); });
  $('#locInput').addEventListener('input', onLocInput);
  $('#btnSettings').addEventListener('click', () => { renderSettings(); togglePanel('settingsPanel'); });
  $('#btnHide').addEventListener('click', togglePanelsHidden);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closePanels));

  $('#setName').addEventListener('input', async (e) => {
    settings.name = e.target.value.trim();
    tickClock();
    clearTimeout(bind._nt);
    bind._nt = setTimeout(() => store.set('sync', 'settings', settings), 400);
  });
  $('#setLogo').addEventListener('change', onLogoFile);
  $('#setPhoto').addEventListener('change', onPhotoFile);
  for (const [id, key] of [['#photoBlur', 'photoBlur'], ['#photoDim', 'photoDim']]) {
    $(id).addEventListener('input', (e) => {
      settings[key] = +e.target.value;
      if (photoActive()) showPhoto();
      clearTimeout(bind._pt);
      bind._pt = setTimeout(() => store.set('sync', 'settings', settings), 400);
    });
  }
  $('#aiCopy').addEventListener('click', copyScenePrompt);
  $('#aiLoad').addEventListener('click', () => {
    const text = $('#aiInput').value.trim();
    if (!text) return showMsg('#aiMsg', 'Paste the reply from your AI assistant first.', 'error');
    useSceneText(text, 'your paste');
  });
  $('#aiFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 300 * 1024) return showMsg('#aiMsg', 'That file is over 300 KB. Ask your assistant for fewer objects.', 'error');
    useSceneText(await file.text(), file.name);
  });
  $('#aiSample').addEventListener('click', async () => {
    const res = await fetch('js/scenes/samples/riad.json');
    useSceneText(await res.text(), 'the sample');
  });
  $('#logoReset').addEventListener('click', async () => {
    customLogo = null;
    await store.set('local', 'logo', null);
    logoMessage('');
    renderLogo();
  });
  $('#showWelcome').addEventListener('click', openWelcome);
  $('#backupSave').addEventListener('click', saveBackup);
  $('#backupFile').addEventListener('change', onBackupFile);
  $('#resetLinks').addEventListener('click', () => { links = DEFAULT_LINKS.map((l) => ({ ...l })); saveLinks(); });

  $('#forecast').addEventListener('click', (e) => {
    const b = e.target.closest('.day');
    if (!b) return;
    const i = +b.dataset.day;
    if (selectedDay === i && !$('#hourlyPanel').hidden) { closePanels(); return; }
    selectedDay = i;
    renderWeather();
    openPanel('hourlyPanel');
    renderHourly();
  });
  $('#hourlySeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    hourlyMetric = b.dataset.metric;
    renderHourly();
  });

  // links
  $('#btnEditLinks').addEventListener('click', () => { editingLinks = !editingLinks; if (!editingLinks) $('#linkForm').hidden = true; renderLinks(); });
  $('#linkCancel').addEventListener('click', () => ($('#linkForm').hidden = true));
  $('#linkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let url = $('#linkUrl').value.trim();
    const name = $('#linkName').value.trim();
    if (!url || !name) return;
    if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
    if (editIndex >= 0) links[editIndex] = { name, url };
    else links.push({ name, url });
    $('#linkForm').hidden = true;
    saveLinks();
  });

  // tabs
  $$('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.toggle('on', x === t));
      $$('.tabpane').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
      store.set('local', 'tab', t.dataset.tab);
    })
  );

  // tasks
  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#taskInput').value.trim();
    if (!v) return;
    tasks.unshift({ text: v, done: false, at: Date.now() });
    $('#taskInput').value = '';
    saveTasks();
  });
  $('#tasks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = +b.closest('li').dataset.i;
    if (b.dataset.act === 'tick') tasks[i].done = !tasks[i].done;
    else tasks.splice(i, 1);
    saveTasks();
  });
  $('#clearDone').addEventListener('click', () => { tasks = tasks.filter((t) => !t.done); saveTasks(); });

  // notes
  let nt;
  $('#notes').addEventListener('input', () => {
    clearTimeout(nt);
    nt = setTimeout(() => store.set('local', 'notes', $('#notes').value), 350);
  });

  // timer
  $$('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = +b.dataset.preset;
      timer = { duration: m * 60, remaining: m * 60, endAt: null, label: m <= 10 ? 'Break' : m >= 45 ? 'Deep work' : 'Focus' };
      saveTimer();
      runTimerLoop();
    })
  );
  $('#timerStart').addEventListener('click', () => {
    if (timer.endAt) { timer.remaining = timerLeft(); timer.endAt = null; }
    else timer.endAt = Date.now() + timer.remaining * 1000;
    saveTimer();
    runTimerLoop();
  });
  $('#timerReset').addEventListener('click', () => {
    timer.endAt = null;
    timer.remaining = timer.duration;
    saveTimer();
    runTimerLoop();
  });

  // ambience
  $('#btnSound').addEventListener('click', () => {
    if (ambience.on) ambience.stop(); else ambience.start();
    $('#btnSound').classList.toggle('on', ambience.on);
    $('#btnSound [data-icon]').dataset.icon = ambience.on ? 'sound' : 'sound';
  });

  // keyboard
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if (e.key === 'Escape') { closePanels(); document.activeElement?.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); $('#searchInput').focus(); }
    else if (e.key === 'h' || e.key === 'H') togglePanelsHidden();
  });

  // click outside panels
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.panel, .tools-btns, .forecast')) return;
    if (PANELS.some((p) => !$('#' + p).hidden)) closePanels();
  });

  // other tabs edited data
  if (hasChrome && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.tasks) { tasks = ch.tasks.newValue || []; renderTasks(); }
      if (ch.links) { links = ch.links.newValue || []; renderLinks(); }
      if (ch.notes && document.activeElement !== $('#notes')) $('#notes').value = ch.notes.newValue || '';
      if (ch.timer) { timer = ch.timer.newValue || timer; runTimerLoop(); }
    });
  }
}

function togglePanelsHidden() {
  settings.panelsHidden = !settings.panelsHidden;
  document.body.classList.toggle('panels-hidden', settings.panelsHidden);
  const i = $('#btnHide [data-icon]');
  i.dataset.icon = settings.panelsHidden ? 'eyeOff' : 'eye';
  paintIcons($('#btnHide'));
  store.set('sync', 'settings', settings);
}

/* ---------------- welcome ---------------- */
const FALLBACK_LOCATION = { name: 'London', lat: 51.5072, lon: -0.1276, auto: false };

function openWelcome() {
  closePanels();
  startWelcome({
    settings,
    saveSettings: () => store.set('sync', 'settings', settings),
    setScene: () => loadSceneSet(),
    frameShift: (f) => scene?.setFrameShift(f),
    geolocate: () => geolocate(8000),
    reverseGeocode,
    geocode,
    setLocation,
    getLinks: () => links,
    setLinks: (list) => {
      links = list.map(({ name, url }) => ({ name, url }));
      saveLinks();
      renderLinks();
    },
    faviconURL,
    iconLuminance,
    onDone: () => {
      store.set('sync', 'onboarded', true);
      if (settings.location?.fallback) {
        delete settings.location.fallback;
        store.set('sync', 'settings', settings);
      }
      tickClock();
    },
  });
}

/* ---------------- backup ---------------- */
// One JSON file holding everything a person has set up. Restoring only replaces the parts the
// file contains, and every part is checked, since a backup could have been edited by hand.
const BACKUP_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/;

async function saveBackup() {
  const data = {
    worldlet: 'backup',
    version: 1,
    savedAt: new Date().toISOString(),
    settings,
    links,
    logo: customLogo,
    photo,
    customScene: await store.get('local', 'customScene', null),
    tasks,
    notes: $('#notes').value,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `worldlet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showMsg('#backupMsg', 'Backup saved to your downloads.', 'ok');
}

function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Worldlet backup.");
  }
  if (!data || data.worldlet !== 'backup') throw new Error("That file isn't a Worldlet backup.");
  const out = {};
  if (data.settings && typeof data.settings === 'object') {
    out.settings = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in data.settings) out.settings[k] = data.settings[k];
  }
  if (Array.isArray(data.links)) {
    out.links = data.links
      .filter((l) => l && typeof l.name === 'string' && typeof l.url === 'string' && /^(https?|chrome|edge):/i.test(l.url))
      .slice(0, 40)
      .map((l) => ({ name: l.name.slice(0, 40), url: l.url }));
  }
  if (typeof data.logo === 'string' && IMAGE_DATA_URL.test(data.logo)) out.logo = data.logo;
  if (data.photo && typeof data.photo.url === 'string' && IMAGE_DATA_URL.test(data.photo.url)) {
    out.photo = { url: data.photo.url, lum: Number(data.photo.lum) || 0.5 };
  }
  if (data.customScene) {
    try { out.customScene = checkScene(data.customScene); } catch { /* skip a broken scene */ }
  }
  if (Array.isArray(data.tasks)) {
    out.tasks = data.tasks.filter((t) => t && typeof t.text === 'string').map((t) => ({ text: t.text.slice(0, 300), done: !!t.done }));
  }
  if (typeof data.notes === 'string') out.notes = data.notes;
  if (!Object.keys(out).length) throw new Error('That backup is empty.');
  return out;
}

async function onBackupFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > BACKUP_MAX_BYTES) return showMsg('#backupMsg', 'That file is too big to be a Worldlet backup.', 'error');
  let b;
  try {
    b = readBackup(await file.text());
  } catch (err) {
    return showMsg('#backupMsg', err.message, 'error');
  }
  if (b.settings) await store.set('sync', 'settings', { ...settings, ...b.settings });
  if (b.links) await store.set('sync', 'links', b.links);
  if (b.logo) await store.set('local', 'logo', b.logo);
  if (b.photo) await store.set('local', 'photo', b.photo);
  if (b.customScene) await store.set('local', 'customScene', b.customScene);
  if (b.tasks) await store.set('local', 'tasks', b.tasks);
  if ('notes' in b) await store.set('local', 'notes', b.notes);
  await store.set('sync', 'onboarded', true);
  location.reload();
}

/* ---------------- boot ---------------- */
async function boot() {
  const saved = await store.get('sync', 'settings', null);
  settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  // Fresh installs get the welcome steps; people who already have settings skip them.
  const onboarded = await store.get('sync', 'onboarded', false);
  const firstRun = !onboarded && !saved;
  if (!onboarded && saved) store.set('sync', 'onboarded', true);
  customLogo = await store.get('local', 'logo', null);
  photo = await store.get('local', 'photo', null);
  try {
    const saved = await store.get('local', 'customScene', null);
    customScene = saved ? checkScene(saved) : null; // re-check anything read back from storage
  } catch {
    customScene = null;
  }
  links = await store.get('sync', 'links', null);
  if (!Array.isArray(links)) links = DEFAULT_LINKS.map((l) => ({ ...l }));
  tasks = await store.get('local', 'tasks', []);
  $('#notes').value = await store.get('local', 'notes', '');
  timer = await store.get('local', 'timer', timer);
  const tab = await store.get('local', 'tab', 'tasks');
  $(`.tab[data-tab="${tab}"]`)?.click();

  document.body.classList.toggle('panels-hidden', !!settings.panelsHidden);
  if (settings.panelsHidden) $('#btnHide [data-icon]').dataset.icon = 'eyeOff';
  document.body.classList.toggle('night', isNightNow());

  paintIcons();
  bind();
  renderLogo();
  tickClock();
  setInterval(tickClock, 1000);
  renderLinks();
  renderTasks();
  runTimerLoop();

  // show cached weather straight away
  const cached = readCache();
  if (cached && settings.location) { wx = cached; }
  renderWeather();
  await initScene();

  if (firstRun) {
    // Don't ask for location before the welcome step explains why; show a placeholder city meanwhile.
    if (!settings.location) settings.location = { ...FALLBACK_LOCATION, fallback: true };
    openWelcome();
  } else if (!settings.location) {
    $('#city').textContent = 'Locating…';
    try {
      const p = await geolocate(6000);
      const name = await reverseGeocode(p.lat, p.lon);
      settings.location = { name, lat: p.lat, lon: p.lon, auto: true };
    } catch {
      settings.location = { ...FALLBACK_LOCATION };
    }
    await store.set('sync', 'settings', settings);
  }
  renderWeather();
  await loadWeather();

  // keep things fresh
  setInterval(() => applyScene(), 60 * 1000);
  setInterval(() => loadWeather(), 20 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { tickClock(); applyScene(); loadWeather(); }
  });
}

boot();
