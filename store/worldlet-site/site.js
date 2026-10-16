// Runs the real Worldlet engine in the homepage hero and wires the try-it controls.
const hero = document.querySelector('.hero');
const canvas = document.getElementById('world');

const TIMES = {
  morning: { p: 0.07, e: 0.2 },
  day: { p: 0.45, e: 0.95 },
  evening: { p: 0.95, e: 0.12 },
  night: { p: 1.3, e: -0.42 },
};
const WIND = { clear: 8, rain: 18, snow: 10, storm: 38 };

function timeNow() {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}
function seasonNow() {
  const m = new Date().getMonth();
  return ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][m];
}

const state = { scene: 'island', time: timeNow(), weather: 'clear' };
let world = null, presets = null, checkScene = null;

function press(attr, value) {
  document.querySelectorAll(`.dock [data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
}

function applyEnv(instant = false) {
  if (!world) return;
  world.setSun(TIMES[state.time], instant);
  world.setWeather(presets[state.weather], WIND[state.weather]);
  world.setSeason(state.weather === 'snow' ? 'winter' : seasonNow());
}

async function loadScene(name, data = null) {
  state.scene = name;
  press('scene', name);
  if (world) await world.setScene(name, data);
}

async function start() {
  try {
    const [{ World }, weather, custom] = await Promise.all([
      import('./engine/js/world.js'),
      import('./engine/js/weather.js'),
      import('./engine/js/custom-scene.js'),
    ]);
    presets = weather.WEATHER_PRESETS;
    checkScene = custom.checkScene;
    world = new World(canvas);
  } catch (e) {
    console.warn('3D view unavailable', e);
    hero.classList.add('no-webgl');
    document.querySelector('.dock').hidden = true;
    return;
  }

  const small = matchMedia('(max-width: 900px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');

  world.setQuality(small.matches ? 'low' : 'auto');
  world.setAutoRotate(!reduced.matches);
  // The page should scroll, not zoom, when the wheel or a finger passes over the hero.
  world.controls.enableZoom = false;
  if (coarse.matches) {
    world.controls.enabled = false;
    canvas.style.touchAction = 'pan-y';
  }
  const frame = () => world.setFrameShift(small.matches ? 0 : 0.17);
  frame();
  small.addEventListener('change', frame);

  world.onNightChange = (n) => hero.classList.toggle('night', n);
  press('time', state.time);
  await loadScene(state.scene);
  applyEnv(true);

  // Stop drawing while the hero is scrolled out of view.
  new IntersectionObserver(([entry]) => world.setPaused(!entry.isIntersecting), { threshold: 0.02 }).observe(hero);
}

document.querySelectorAll('.dock [data-scene]').forEach((b) => b.addEventListener('click', () => loadScene(b.dataset.scene)));
document.querySelectorAll('.dock [data-time]').forEach((b) =>
  b.addEventListener('click', () => { state.time = b.dataset.time; press('time', state.time); applyEnv(); })
);
document.querySelectorAll('.dock [data-weather]').forEach((b) =>
  b.addEventListener('click', () => { state.weather = b.dataset.weather; press('weather', state.weather); applyEnv(); })
);
document.querySelectorAll('[data-load]').forEach((b) =>
  b.addEventListener('click', () => {
    loadScene(b.dataset.load);
    hero.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  })
);

document.getElementById('loadRiad').addEventListener('click', async () => {
  const msg = document.getElementById('riadMsg');
  msg.hidden = false;
  msg.classList.remove('error');
  if (!world) {
    msg.textContent = "This browser can't show the 3D view, so the example can't load here.";
    msg.classList.add('error');
    return;
  }
  try {
    const data = checkScene(await (await fetch('engine/js/scenes/samples/riad.json')).text());
    press('scene', '');
    state.scene = 'custom';
    await world.setScene('custom', data);
    msg.textContent = `Loaded "${data.name}": ${data.shapeCount} shapes from one small file.`;
    hero.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch {
    msg.textContent = "The example couldn't load. Refresh the page and try again.";
    msg.classList.add('error');
  }
});

start();
