// First-run welcome: four short steps in a side panel over the live scene.
// Name → location for weather → pick a scene → quick links.

import { brandFor, brandSVG } from './brand-icons.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SCENE_CHOICES = [
  { id: 'island', name: 'Island', img: 'icons/scenes/island.jpg' },
  { id: 'desert', name: 'Desert oasis', img: 'icons/scenes/desert.jpg' },
  { id: 'cabin', name: 'Mountain cabin', img: 'icons/scenes/cabin.jpg' },
  { id: 'zen', name: 'Zen garden', img: 'icons/scenes/zen.jpg' },
  { id: 'camp', name: 'Lake camp', img: 'icons/scenes/camp.jpg' },
];

const POPULAR_LINKS = [
  { name: 'Gmail', url: 'https://mail.google.com/' },
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'Drive', url: 'https://drive.google.com/' },
  { name: 'Calendar', url: 'https://calendar.google.com/' },
  { name: 'Maps', url: 'https://www.google.com/maps' },
  { name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: 'Claude', url: 'https://claude.ai/' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Notion', url: 'https://www.notion.so/' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/' },
  { name: 'X', url: 'https://x.com/' },
  { name: 'Reddit', url: 'https://www.reddit.com/' },
  { name: 'Instagram', url: 'https://www.instagram.com/' },
  { name: 'Netflix', url: 'https://www.netflix.com/' },
  { name: 'Spotify', url: 'https://open.spotify.com/' },
];
const MAX_LINKS = 12;
const CHECK = '<span class="pick-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';

/**
 * api: {
 *   settings, saveSettings(), setScene(id), frameShift(fraction),
 *   geolocate(), reverseGeocode(lat, lon), geocode(q), setLocation(loc),
 *   getLinks(), setLinks(list), faviconURL(url), iconLuminance(img), onDone()
 * }
 */
export function startWelcome(api) {
  const root = $('#welcome');
  const steps = $$('[data-step]', root);
  let step = 0;
  const picked = new Map(api.getLinks().map((l) => [l.url, l]));

  document.body.classList.add('welcome-mode');
  root.hidden = false;
  api.frameShift(0.18);

  /* step 1: name */
  const nameInput = $('#wName');
  nameInput.value = api.settings.name || '';

  /* step 2: location */
  const locStatus = $('#wLocStatus');
  const showLoc = () => {
    const l = api.settings.location;
    const real = l && !l.fallback;
    locStatus.textContent = real ? `Showing the weather for ${l.name}.` : '';
    locStatus.hidden = !real;
  };
  $('#wLocate').onclick = async () => {
    const btn = $('#wLocate');
    btn.disabled = true;
    btn.textContent = 'Finding you…';
    try {
      const p = await api.geolocate();
      const name = await api.reverseGeocode(p.lat, p.lon);
      await api.setLocation({ name, lat: p.lat, lon: p.lon, auto: true });
      showLoc();
    } catch {
      locStatus.hidden = false;
      locStatus.textContent = "Couldn't get your position. Search for your city instead.";
      $('#wCity').focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Use my location';
    }
  };
  let geoTimer;
  $('#wCity').oninput = (e) => {
    clearTimeout(geoTimer);
    const q = e.target.value;
    const list = $('#wCityResults');
    geoTimer = setTimeout(async () => {
      if (q.trim().length < 2) { list.innerHTML = ''; return; }
      try {
        const res = await api.geocode(q);
        list.innerHTML = res.length
          ? res.map((r, i) => `<li><button data-i="${i}">${esc(r.name)}<small>${esc(r.region)}</small></button></li>`).join('')
          : '<li class="muted">No places found</li>';
        $$('button[data-i]', list).forEach((b) =>
          b.addEventListener('click', async () => {
            const r = res[+b.dataset.i];
            list.innerHTML = '';
            $('#wCity').value = '';
            await api.setLocation({ name: r.name, lat: r.lat, lon: r.lon, auto: false });
            showLoc();
          })
        );
      } catch {
        list.innerHTML = '<li class="muted">Search is unavailable right now</li>';
      }
    }, 280);
  };

  /* step 3: scene */
  const sceneGrid = $('#wScenes');
  const renderScenes = () => {
    sceneGrid.innerHTML = SCENE_CHOICES.map(
      (s) => `<button class="scene-tile${api.settings.scene === s.id ? ' on' : ''}" data-scene="${s.id}" aria-pressed="${api.settings.scene === s.id}">
        <img src="${s.img}" alt="" /><span>${s.name}</span>${api.settings.scene === s.id ? CHECK : ''}</button>`
    ).join('');
    $$('[data-scene]', sceneGrid).forEach((b) =>
      b.addEventListener('click', () => {
        api.settings.scene = b.dataset.scene;
        api.saveSettings();
        api.setScene(b.dataset.scene);
        renderScenes();
      })
    );
  };

  /* step 4: quick links */
  const linkGrid = $('#wLinks');
  const linkCount = $('#wLinkCount');
  const renderLinks = () => {
    const extra = [...picked.values()].filter((l) => !POPULAR_LINKS.some((p) => p.url === l.url));
    const all = [...POPULAR_LINKS, ...extra];
    linkGrid.innerHTML = all
      .map((l, i) => {
        const brand = brandFor(l.url);
        const fav = api.faviconURL(l.url);
        const on = picked.has(l.url);
        const icon = brand
          ? `<span class="pick-ico">${brandSVG(brand)}</span>`
          : fav
            ? `<img src="${esc(fav)}" alt="" />`
            : `<span class="letter">${esc(l.name[0].toUpperCase())}</span>`;
        return `<button class="link-pick${on ? ' on' : ''}" data-i="${i}" aria-pressed="${on}">${icon}<span>${esc(l.name)}</span>${on ? CHECK : ''}</button>`;
      })
      .join('');
    linkCount.textContent = `${picked.size} of ${MAX_LINKS} picked`;
    $$('[data-i]', linkGrid).forEach((b) =>
      b.addEventListener('click', () => {
        const l = all[+b.dataset.i];
        if (picked.has(l.url)) picked.delete(l.url);
        else if (picked.size < MAX_LINKS) picked.set(l.url, l);
        renderLinks();
      })
    );
    // Same contrast fallback as the quick-link tiles: white logos (GitHub in dark mode) get a dark chip.
    $$('img', linkGrid).forEach((img) => {
      const check = () => img.classList.toggle('on-dark', api.iconLuminance(img) > 225);
      if (img.complete) check();
      else img.addEventListener('load', check, { once: true });
    });
  };

  /* navigation */
  const dots = $('#wDots');
  const go = (n) => {
    step = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach((s, i) => (s.hidden = i !== step));
    dots.innerHTML = steps.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
    dots.setAttribute('aria-label', `Step ${step + 1} of ${steps.length}`);
    $('#wBack').hidden = step === 0;
    $('#wNext').textContent = step === steps.length - 1 ? 'Start exploring' : 'Continue';
    if (step === 0) setTimeout(() => nameInput.focus(), 50);
    if (step === 1) showLoc();
    if (step === 2) renderScenes();
    if (step === 3) renderLinks();
  };
  const saveStep = () => {
    if (step === 0) {
      api.settings.name = nameInput.value.trim().slice(0, 30);
      api.saveSettings();
    }
  };
  const finish = () => {
    saveStep();
    if (picked.size) api.setLinks([...picked.values()]);
    root.hidden = true;
    document.body.classList.remove('welcome-mode');
    api.frameShift(0);
    api.onDone();
  };

  $('#wNext').onclick = () => {
    saveStep();
    if (step === steps.length - 1) finish();
    else go(step + 1);
  };
  $('#wBack').onclick = () => { saveStep(); go(step - 1); };
  $('#wSkip').onclick = finish;
  nameInput.onkeydown = (e) => { if (e.key === 'Enter') $('#wNext').click(); };

  go(0);
}
