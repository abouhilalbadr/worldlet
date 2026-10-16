// Shared low-poly world: sky, sun and moon, clouds, rain/snow, seasons and camera.
// The middle of the world is a swappable "set" (island, desert, cabin…) from js/scenes/.
import { OrbitControls } from '../lib/OrbitControls.js';
import { THREE, TAU, rng, smooth, lerp, mat, disposeTree } from './scenes/kit.js';

const SEASONS = {
  spring: { grass: '#8cc95a', leaves: ['#9bd46c', '#7cc26a', '#f2b5c8', '#b5dc78'] },
  summer: { grass: '#7cba4e', leaves: ['#4f9a4a', '#5fae55', '#3f8a45', '#6cb85c'] },
  autumn: { grass: '#93bb4f', leaves: ['#e8902f', '#f2b23a', '#d4572a', '#8fae45'] },
  winter: { grass: '#e9eff3', leaves: ['#e9eef2', '#d5e0e6', '#c9d6dd', '#f3f6f8'] },
};

// Sky/light keyframes keyed by sun elevation
const KEYS = [
  { e: -0.35, top: '#0b1840', hor: '#2a4580', sun: '#a6bcff', sunI: 1.0, hs: '#5068b0', hg: '#141c34', hi: 1.0, sh: '#2b7c9c', dp: '#123a70', cl: '#4a5a8a' },
  { e: -0.04, top: '#2a3a72', hor: '#e8896c', sun: '#ff8a5c', sunI: 0.7, hs: '#76739f', hg: '#3a2a2a', hi: 0.7, sh: '#4a9db0', dp: '#294c86', cl: '#e0a090' },
  { e: 0.14, top: '#6f93cc', hor: '#f6cba2', sun: '#ffb47a', sunI: 2.3, hs: '#b4c6e6', hg: '#6b5a40', hi: 0.95, sh: '#79d7cf', dp: '#2f77b0', cl: '#fff1e6' },
  { e: 0.55, top: '#5aa2e2', hor: '#d8eaf6', sun: '#fff4e2', sunI: 3.0, hs: '#d2e5ff', hg: '#6c7a4a', hi: 1.15, sh: '#8be6da', dp: '#2b80c2', cl: '#ffffff' },
];

function sampleKeys(e) {
  let a = KEYS[0], b = KEYS[0], t = 0;
  if (e >= KEYS[KEYS.length - 1].e) { a = b = KEYS[KEYS.length - 1]; }
  else if (e > KEYS[0].e) {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; t = (e - a.e) / (b.e - a.e); break; }
    }
  }
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'e') continue;
    out[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], t) : new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
  }
  return out;
}

const DEFAULT_CAMERA = { target: [0, 2.2, 0], position: [0, 12.5, 46], min: 22, max: 72 };

export const SCENES = ['island', 'desert', 'cabin', 'zen', 'camp'];

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.quality = 'auto';
    this.onNightChange = null;
    this._night = null;
    this.paused = false;
    this.frameShift = 0;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog('#d8eaf6', 60, 230);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 1200);
    const controls = (this.controls = new OrbitControls(this.camera, canvas));
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = 1.32;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.6;
    this.applyCamera(DEFAULT_CAMERA);

    // Lights
    this.hemi = new THREE.HemisphereLight('#d2e5ff', '#6c7a4a', 1.1);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff4e2', 3));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    // Materials shared by every set; their colours follow the season and snow.
    this.shared = {
      grassMat: mat('#93bb4f'),
      leafMats: [0, 1, 2, 3].map(() => mat('#e8902f')),
      pineMat: mat('#2f6b3f'),
      pineMat2: mat('#3d7f4a'),
      trunkMat: mat('#6e4b32'),
      windowMat: new THREE.MeshStandardMaterial({ color: '#4a5866', emissive: '#ffb65c', emissiveIntensity: 0, flatShading: true, roughness: 0.6 }),
    };
    this.keep = new Set([this.shared.grassMat, ...this.shared.leafMats, this.shared.pineMat, this.shared.pineMat2, this.shared.trunkMat, this.shared.windowMat]);

    // State (current values lerp toward target)
    this.target = null;
    this.cur = null;
    this.weather = { clouds: 0.3, overcast: 0, rain: 0, snow: 0, fog: 0, storm: 0 };
    this.wind = 10;
    this.snowCover = 0;
    this.season = 'autumn';
    this.flash = 0;
    this.nextFlash = 3;
    this.set = null;
    this.setName = null;

    this.buildSky();
    this.buildClouds();
    this.buildPrecip();

    this.setSeason('autumn');
    this.setSun({ p: 0.5, e: 0.8 }, true);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Also follow the canvas itself, for pages where it fills a section rather than the window.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
    this.setQuality('auto');
    renderer.setAnimationLoop(() => this.tick());
  }

  /* ---------------- sets ---------------- */

  // Load a set by name ('island', 'desert'…) or a custom scene description ('custom', data).
  async setScene(name, data = null) {
    const token = (this._loadToken = {});
    const mod = await import(`./scenes/${name}.js`);
    if (token !== this._loadToken) return; // a newer request won
    const ctx = { ...this.shared, renderer: this.renderer, data };
    const next = mod.build(ctx);
    if (this.set) {
      this.scene.remove(this.set.group);
      this.set.dispose?.();
      disposeTree(this.set.group, this.keep);
    }
    this.set = next;
    this.setName = name;
    this.scene.add(next.group);
    this.applyCamera({ ...DEFAULT_CAMERA, ...(next.camera || {}) });
  }

  applyCamera(c) {
    this.camera.position.set(...c.position);
    this.controls.target.set(...c.target);
    this.controls.minDistance = c.min;
    this.controls.maxDistance = c.max;
    this.controls.update();
  }

  /* ---------------- building ---------------- */

  buildSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    this.skyUniforms = {
      top: { value: new THREE.Color('#5aa2e2') },
      hor: { value: new THREE.Color('#d8eaf6') },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vP;
        void main(){ float h = clamp(vP.y, 0.0, 1.0); float t = pow(h, 0.55); gl_FragColor = vec4(mix(hor, top, t), 1.0);
        #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, m);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // stars
    const n = 1400, pos = new Float32Array(n * 3), R = rng(11);
    for (let i = 0; i < n; i++) {
      const th = R() * TAU, y = 0.08 + R() * 0.92, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 520, y * 520, Math.sin(th) * r * 520], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);

    this.moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: '#f5f0dc', fog: false, transparent: true, opacity: 0 }));
    this.scene.add(this.moon);
  }

  buildClouds() {
    const R = rng(55);
    this.cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.96 });
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + R() * 0.9, 1), this.cloudMat);
        m.position.set((k - n / 2) * 0.9 + R() * 0.4, R() * 0.6, (R() - 0.5) * 1.2);
        m.scale.y = 0.75;
        g.add(m);
      }
      const ang = R() * TAU, rad = 9 + R() * 20, y = 8.5 + R() * 4.5;
      g.userData = { ang, rad, y, speed: 0.008 + R() * 0.012, order: R(), bob: R() * 10 };
      g.scale.setScalar(0.9 + R() * 0.8);
      this.scene.add(g);
      this.clouds.push(g);
    }
    this.clouds.sort((a, b) => a.userData.order - b.userData.order);
  }

  buildPrecip() {
    // rain
    const N = 2400;
    this.rainN = N;
    const pos = new Float32Array(N * 6);
    const R = rng(66);
    this.rainSeed = [];
    for (let i = 0; i < N; i++) {
      const x = (R() - 0.5) * 44, y = R() * 22, z = (R() - 0.5) * 44;
      this.rainSeed.push([x, y, z, 0.8 + R() * 0.4]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d6e4f0', transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // snow
    const SN = 2600;
    this.snowN = SN;
    const sp = new Float32Array(SN * 3);
    this.snowSeed = [];
    for (let i = 0; i < SN; i++) this.snowSeed.push([(R() - 0.5) * 46, R() * 22, (R() - 0.5) * 46, R() * 10, 0.6 + R() * 0.6]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 32, 32);
    this.snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.22, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: '#ffffff' }));
    this.snowPts.frustumCulled = false;
    this.scene.add(this.snowPts);
  }

  /* ---------------- public API ---------------- */

  setSeason(season) {
    this.season = season;
    const s = SEASONS[season] || SEASONS.autumn;
    this.seasonTarget = { grass: new THREE.Color(s.grass), leaves: s.leaves.map((c) => new THREE.Color(c)) };
    if (!this.seasonCur) this.seasonCur = { grass: this.seasonTarget.grass.clone(), leaves: this.seasonTarget.leaves.map((c) => c.clone()) };
  }

  setWeather(params, windKmh = 10) {
    this.weather = { ...params };
    this.wind = windKmh;
  }

  setSun({ p, e }, instant = false) {
    this.sunP = p;
    this.sunE = e;
    const k = sampleKeys(e);
    this.target = k;
    if (instant || !this.cur) {
      this.cur = {};
      for (const [key, v] of Object.entries(k)) this.cur[key] = typeof v === 'number' ? v : v.clone();
      this._e = e;
    }
  }

  setAutoRotate(on) {
    this.controls.autoRotate = !!on;
  }

  // Stop rendering entirely (e.g. while a photo background is shown).
  setPaused(on) {
    this.paused = !!on;
    this.renderer.setAnimationLoop(on ? null : () => this.tick());
    if (!on) this.clock.getDelta();
  }

  setFrameShift(fraction) {
    this.frameShift = fraction;
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    let pr = Math.min(dpr, 1.5), shadow = 2048;
    if (q === 'low') { pr = 1; shadow = 1024; }
    if (q === 'high') { pr = Math.min(dpr, 2); shadow = 4096; }
    this.renderer.setPixelRatio(pr);
    if (this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the set framed on narrow screens
    this.camera.fov = w / h < 1.2 ? 48 : 34;
    // Shift the view sideways (e.g. to keep the set centred beside the welcome panel).
    if (this.frameShift) this.camera.setViewOffset(w, h, -w * this.frameShift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- frame ---------------- */

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const W = this.weather;
    const blend = 1 - Math.exp(-dt * 1.8);

    // lerp environment
    const cur = this.cur, tgt = this.target;
    for (const k of Object.keys(tgt)) {
      if (typeof cur[k] === 'number') cur[k] = lerp(cur[k], tgt[k], blend);
      else cur[k].lerp(tgt[k], blend);
    }
    this._ov = lerp(this._ov ?? W.overcast, W.overcast, blend);
    this._fog = lerp(this._fog ?? W.fog, W.fog, blend);
    this._rain = lerp(this._rain ?? W.rain, W.rain, blend);
    this._snow = lerp(this._snow ?? W.snow, W.snow, blend);
    this._clouds = lerp(this._clouds ?? W.clouds, W.clouds, blend);
    const e = lerp(this._e ?? this.sunE, this.sunE, blend);
    this._e = e;
    const night = smooth(0.06, -0.12, e);
    const ov = this._ov;
    const set = this.set;

    // season colors (+ snow cover; a set may override how much snow settles)
    const defaultCover = this.season === 'winter' ? 0.9 : smooth(0.2, 0.8, this._snow) * 0.75;
    const snowCover = set?.snowCover ? set.snowCover(this.season, this._snow) : defaultCover;
    this.snowCover = lerp(this.snowCover, snowCover, blend * 0.5);
    const white = new THREE.Color('#eef3f6');
    const S = this.shared;
    this.seasonCur.grass.lerp(this.seasonTarget.grass, blend);
    S.grassMat.color.copy(this.seasonCur.grass).lerp(white, this.snowCover);
    S.leafMats.forEach((m, i) => {
      this.seasonCur.leaves[i].lerp(this.seasonTarget.leaves[i], blend);
      m.color.copy(this.seasonCur.leaves[i]).lerp(white, this.snowCover * 0.5);
    });
    S.pineMat.color.set('#2f6b3f').lerp(white, this.snowCover * 0.35);
    S.pineMat2.color.set('#3d7f4a').lerp(white, this.snowCover * 0.35);

    // sky & lights with overcast desaturation
    const grayDay = new THREE.Color('#a3adb7'), grayNight = new THREE.Color('#1c2333');
    const gray = grayDay.clone().lerp(grayNight, night);
    const top = cur.top.clone().lerp(gray, ov * 0.75);
    const hor = cur.hor.clone().lerp(gray.clone().lerp(new THREE.Color('#ffffff'), 0.15 * (1 - night)), ov * 0.7);
    if (set?.horizonTint) hor.lerp(new THREE.Color(set.horizonTint), 0.25 * (1 - night) * (1 - ov));
    const flash = this.flash;
    if (flash > 0) { top.lerp(new THREE.Color('#dfe6ff'), flash * 0.6); hor.lerp(new THREE.Color('#ffffff'), flash * 0.6); }
    this.skyUniforms.top.value.copy(top);
    this.skyUniforms.hor.value.copy(hor);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = lerp(75, 20, this._fog);
    this.scene.fog.far = lerp(280, 95, this._fog);

    this.sun.color.copy(cur.sun);
    this.sun.intensity = cur.sunI * (1 - ov * 0.72) + flash * 3;
    this.hemi.color.copy(cur.hs).lerp(gray, ov * 0.5);
    this.hemi.groundColor.copy(cur.hg);
    this.hemi.intensity = cur.hi * (1 + ov * 0.15) + flash * 1.5;

    // sun direction
    let dir;
    if (e > -0.02) {
      const p = Math.min(1, Math.max(0, this.sunP));
      const az = lerp(-1.9, 1.9, p) + 0.6;
      const el = Math.max(0.12, Math.asin(Math.min(1, Math.max(-1, e))) * 0.9);
      dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    } else {
      dir = new THREE.Vector3(-0.5, 0.75, 0.45).normalize(); // moonlight
    }
    this._dir = this._dir ? this._dir.lerp(dir, blend).normalize() : dir;
    this.sun.position.copy(this._dir).multiplyScalar(45);
    this.sun.target.position.set(0, 0, 0);
    this.moon.position.copy(this._dir).multiplyScalar(420);
    this.moon.material.opacity = night * (1 - ov * 0.8);
    this.moon.visible = night > 0.02;
    this.stars.material.opacity = night * (1 - ov) * 0.95;
    this.stars.rotation.y = t * 0.003;
    this.renderer.toneMappingExposure = 1.0;

    // open-ground sets read too bright at night; dim their grass
    if (set?.nightDim) S.grassMat.color.multiplyScalar(1 - night * set.nightDim);

    // night lights
    S.windowMat.emissiveIntensity = night * 2.2 + ov * 0.25;

    // the set's own animation
    const env = { t, dt, night, ov, fog: this._fog, rain: this._rain, snow: this._snow, wind: this.wind, season: this.season, snowCover: this.snowCover, flash, gray, cur };
    set?.update?.(env);

    // clouds
    const visibleClouds = Math.round(this._clouds * this.clouds.length);
    const cloudCol = cur.cl.clone().lerp(new THREE.Color('#8e98a3').lerp(new THREE.Color('#2a3142'), night), ov * 0.8);
    this.cloudMat.color.copy(cloudCol);
    this.clouds.forEach((c, i) => {
      const u = c.userData;
      u.ang += u.speed * dt * (0.4 + this.wind / 25);
      c.position.set(Math.cos(u.ang) * u.rad, u.y + (set?.cloudLift || 0) + Math.sin(t * 0.3 + u.bob) * 0.2 - ov * 1.5, Math.sin(u.ang) * u.rad);
      c.lookAt(0, c.position.y, 0);
      const want = i < visibleClouds ? 1 : 0;
      c.userData.vis = lerp(c.userData.vis ?? want, want, blend);
      c.visible = c.userData.vis > 0.02;
      const s = (0.55 + (i % 5) * 0.1) * (0.3 + 0.7 * c.userData.vis);
      c.scale.setScalar(s);
    });

    // rain
    const rN = Math.floor(this._rain * this.rainN);
    if (rN > 0) {
      const a = this.rain.geometry.attributes.position.array;
      const slant = Math.min(this.wind, 50) / 120;
      for (let i = 0; i < rN; i++) {
        const s = this.rainSeed[i];
        s[1] -= dt * 22 * s[3];
        if (s[1] < -0.2) s[1] += 22;
        const len = 0.55;
        a[i * 6] = s[0]; a[i * 6 + 1] = s[1]; a[i * 6 + 2] = s[2];
        a[i * 6 + 3] = s[0] + slant * len; a[i * 6 + 4] = s[1] + len; a[i * 6 + 5] = s[2];
      }
      this.rain.geometry.setDrawRange(0, rN * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.color.set(night > 0.5 ? '#8fa3c0' : '#d6e4f0');
    }
    this.rain.visible = rN > 0;

    // snow
    const sN = Math.floor(this._snow * this.snowN);
    if (sN > 0) {
      const a = this.snowPts.geometry.attributes.position.array;
      for (let i = 0; i < sN; i++) {
        const s = this.snowSeed[i];
        s[1] -= dt * 1.4 * s[4];
        if (s[1] < -0.2) s[1] += 22;
        a[i * 3] = s[0] + Math.sin(t * 0.7 + s[3]) * 0.5;
        a[i * 3 + 1] = s[1];
        a[i * 3 + 2] = s[2] + Math.cos(t * 0.5 + s[3]) * 0.5;
      }
      this.snowPts.geometry.setDrawRange(0, sN);
      this.snowPts.geometry.attributes.position.needsUpdate = true;
    }
    this.snowPts.visible = sN > 0;

    // lightning
    if (W.storm > 0.5) {
      this.nextFlash -= dt;
      if (this.nextFlash < 0) { this.flash = 1; this.nextFlash = 3 + Math.random() * 7; }
    }
    this.flash = Math.max(0, this.flash - dt * 4.5);

    // night class callback
    const isNight = night > 0.5 || (e < 0.35 && ov > 0.4);
    if (isNight !== this._night) {
      this._night = isNight;
      this.onNightChange && this.onNightChange(isNight);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
