// Zen garden: a koi pond with a red bridge, a pagoda, raked gravel, cherry trees and stone lanterns.
import { THREE, TAU, rng, smooth, mat, shadows, shapedCylinder, terrain, waterMat } from './kit.js';

const GROUND = 0.4;
const POND = { x: -0.8, z: 2.2 };
const pondR = (a) => 3.4 + 0.5 * Math.sin(2 * a + 0.3) + 0.3 * Math.sin(3 * a + 2.2);

// Cherry canopy through the year: blossom, green, red maple, bare/snowy.
const CHERRY = { spring: '#f3b4c6', summer: '#6faa57', autumn: '#d4553a', winter: '#d9d4cf' };

function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const back = smooth(10, -25, z);
  const hills = smooth(13, 45, r) * (2.5 + Math.sin(x * 0.06) * 2 + Math.cos(z * 0.05 + 1) * 1.5) * (0.4 + back * 1.6);
  return GROUND - 0.02 + hills;
}

function makePagoda(ctx) {
  const g = new THREE.Group();
  const red = mat('#c4473a'), roofM = mat('#3a3f47'), wood = mat('#6b4a33'), plaster = mat('#efe6d6');
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 2.8), mat('#9a948a'));
  base.position.y = 0.17;
  g.add(base);
  let y = 0.35;
  const tiers = [[2.0, 1.1], [1.6, 0.9], [1.25, 0.8]];
  tiers.forEach(([w, h], i) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i === 0 ? plaster : red);
    body.position.y = y + h / 2;
    g.add(body);
    for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), wood);
      post.position.set(x, y + h / 2, z);
      g.add(post);
    }
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.4, 0.06), ctx.windowMat);
    win.position.set(0, y + h * 0.55, w / 2 + 0.02);
    g.add(win);
    const roofGeo = new THREE.ConeGeometry(w * 1.05, 0.7, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, roofM);
    roof.scale.set(1, 1, 1);
    roof.position.y = y + h + 0.3;
    g.add(roof);
    y += h + 0.45;
  });
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.1, 6), mat('#b8963f'));
  spire.position.y = y + 0.35;
  g.add(spire);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 8), spire.material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 0.1 + i * 0.18;
    g.add(ring);
  }
  return shadows(g);
}

function makeBridge() {
  const g = new THREE.Group();
  const red = mat('#c8412f'), plank = mat('#8a5c3b');
  const span = 5.2, rise = 0.9, n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = (t - 0.5) * span;
    const y = Math.sin(t * Math.PI) * rise;
    const dy = Math.cos(t * Math.PI) * rise * Math.PI / span;
    const p = new THREE.Mesh(new THREE.BoxGeometry(span / n + 0.02, 0.08, 1.0), plank);
    p.position.set(x, y + 0.2, 0);
    p.rotation.z = Math.atan(dy);
    g.add(p);
  }
  for (const z of [-0.5, 0.5]) {
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = (t - 0.5) * span, y = Math.sin(t * Math.PI) * rise;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), red);
      post.position.set(x, y + 0.45, z);
      g.add(post);
    }
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3((t - 0.5) * span, Math.sin(t * Math.PI) * rise + 0.72, z)); }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 5), red);
    g.add(rail);
  }
  return shadows(g);
}

function makeLantern(ctx) {
  const g = new THREE.Group();
  const stone = mat('#9c968d');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.15, 6), stone); base.position.y = 0.07;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 6), stone); post.position.y = 0.42;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), stone); shelf.position.y = 0.72;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), ctx.windowMat); box.position.y = 0.89;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 6), stone); cap.position.y = 1.15;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), stone); knob.position.y = 1.31;
  g.add(base, post, shelf, box, cap, knob);
  return shadows(g);
}

function makeCherry(R, canopyMat, bark) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.3, 6), bark);
  trunk.position.y = 0.65;
  trunk.rotation.z = (R() - 0.5) * 0.3;
  g.add(trunk);
  const crown = new THREE.Group();
  crown.position.y = 1.45;
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + R() * 0.3, 0), canopyMat);
    c.position.set((R() - 0.5) * 1.3, (R() - 0.3) * 0.5, (R() - 0.5) * 1.3);
    c.rotation.set(R() * 3, R() * 3, R() * 3);
    c.scale.y = 0.75;
    crown.add(c);
  }
  g.add(crown);
  g.userData = { crown, phase: R() * 10 };
  return shadows(g);
}

function makeTorii() {
  const g = new THREE.Group();
  const red = mat('#c8412f'), black = mat('#2b2b2e');
  for (const x of [-0.9, 0.9]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8), red);
    p.position.set(x, 1.1, 0);
    g.add(p);
  }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.16, 0.3), black);
  kasagi.position.y = 2.28;
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.24), red);
  shimaki.position.y = 2.12;
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.14), red);
  nuki.position.y = 1.7;
  g.add(kasagi, shimaki, nuki);
  return shadows(g);
}

export function build(ctx) {
  const group = new THREE.Group();
  const R = rng(311);

  group.add(terrain(ctx.grassMat, groundHeight));

  // pond with stone edge
  const water = waterMat();
  const pond = new THREE.Mesh(shapedCylinder(1, 1, 0.1, 56, pondR), water);
  pond.position.set(POND.x, GROUND - 0.02, POND.z);
  group.add(pond);
  const edgeM = mat('#8e8a83');
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * TAU + R() * 0.08;
    const d = pondR(a) + 0.12;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + R() * 0.16, 0), edgeM);
    s.position.set(POND.x + Math.cos(a) * d, GROUND + 0.02, POND.z + Math.sin(a) * d);
    s.scale.y = 0.55;
    s.rotation.set(R() * 3, R() * 3, R() * 3);
    group.add(shadows(s, true, true));
  }

  // koi swimming loops just under the surface
  const koi = [];
  const koiMats = [mat('#f07a2a'), mat('#f4f0e8'), mat('#e2452f'), mat('#f2b23a')];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), koiMats[i % 4]);
    body.scale.set(2.4, 0.6, 1);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), koiMats[(i + 1) % 4]);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.32;
    f.add(body, tail);
    f.userData = { r: 0.8 + R() * 1.8, speed: (0.25 + R() * 0.25) * (R() < 0.5 ? 1 : -1), phase: R() * TAU, tail };
    group.add(f);
    koi.push(f);
  }

  const bridge = makeBridge();
  bridge.position.set(POND.x, GROUND, POND.z);
  bridge.rotation.y = 0.5;
  group.add(bridge);

  const pagoda = makePagoda(ctx);
  pagoda.position.set(3.6, GROUND, -3.8);
  pagoda.rotation.y = -0.3;
  group.add(pagoda);

  // raked gravel bed with three stones and their ripples
  const gravel = mat('#e4ddcd');
  const bed = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 3.4), gravel);
  bed.position.set(-4.6, GROUND + 0.02, -3.4);
  bed.rotation.y = 0.25;
  bed.receiveShadow = true;
  group.add(bed);
  const rakeM = mat('#cfc6b2');
  const garden = new THREE.Group();
  garden.position.copy(bed.position);
  garden.rotation.y = bed.rotation.y;
  for (let i = 0; i < 9; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.02, 0.05), rakeM);
    line.position.set(0, 0.07, -1.5 + i * 0.375);
    garden.add(line);
  }
  for (const [x, z, s] of [[-1.4, -0.4, 0.55], [0.9, 0.5, 0.42], [1.7, -0.8, 0.3]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat('#7d7a75'));
    rock.position.set(x, 0.15, z);
    rock.scale.y = 0.75;
    rock.rotation.set(R() * 3, R() * 3, R() * 3);
    garden.add(shadows(rock, true, false));
    for (let k = 1; k <= 3; k++) {
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(s + k * 0.17, 0.022, 3, 28), rakeM);
      ripple.rotation.x = Math.PI / 2;
      ripple.position.set(x, 0.07, z);
      garden.add(ripple);
    }
  }
  group.add(garden);

  // stepping stones from the torii to the bridge
  const stepM = mat('#a39d93');
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 5.2 - t * 4.2 + Math.sin(t * 5) * 0.4, z = 6.2 - t * 2.8;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 7), stepM);
    st.position.set(x, GROUND + 0.02, z);
    st.rotation.y = R() * 3;
    group.add(shadows(st, false, true));
  }
  const torii = makeTorii();
  torii.position.set(5.6, GROUND, 6.6);
  torii.rotation.y = -0.6;
  group.add(torii);

  // lanterns
  for (const [x, z] of [[1.9, 4.6], [-3.8, 0.6], [1.4, -1.4], [-2.6, 5.4]]) {
    const l = makeLantern(ctx);
    l.position.set(x, GROUND, z);
    group.add(l);
  }

  // cherry trees
  const canopyMat = mat(CHERRY.autumn);
  const canopyTarget = new THREE.Color(), canopyCur = new THREE.Color(CHERRY.autumn);
  const bark = mat('#4e3a30');
  const cherries = [];
  for (const [x, z] of [[-5.6, 2.8], [5.8, 1.4], [0.8, -6.0], [-6.2, -6.4], [6.8, -6.8], [-2.4, 7.0]]) {
    const c = makeCherry(R, canopyMat, bark);
    c.scale.setScalar(1.1 + R() * 0.5);
    c.position.set(x, GROUND, z);
    group.add(c);
    cherries.push(c);
  }

  // bamboo grove
  const bambooM = mat('#7fae4f'), bambooJ = mat('#5e8a3a');
  const bamboo = [];
  for (let i = 0; i < 16; i++) {
    const stalk = new THREE.Group();
    const h = 2.6 + R() * 1.8, segs = 6;
    for (let k = 0; k < segs; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, h / segs - 0.03, 6), bambooM);
      s.position.y = (k + 0.5) * (h / segs);
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6), bambooJ);
      j.position.y = (k + 1) * (h / segs);
      stalk.add(s, j);
    }
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), ctx.pineMat2);
    leaf.position.y = h;
    leaf.rotation.z = Math.PI;
    stalk.add(leaf);
    stalk.position.set(-7.6 + R() * 2.2, GROUND, -0.8 + R() * 2.6);
    stalk.userData.phase = R() * 10;
    group.add(shadows(stalk, true, false));
    bamboo.push(stalk);
  }

  // distant trees on the hills
  for (let i = 0; i < 40; i++) {
    const a = R() * TAU, d = 14 + R() * 24;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 5) continue; // keep the camera side open
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.7 + R() * 0.6, 2.2 + R() * 1.5, 6), R() < 0.5 ? ctx.pineMat : ctx.pineMat2);
    t.position.set(x, groundHeight(x, z) + 1, z);
    group.add(shadows(t, true, false));
  }

  return {
    group,
    horizonTint: '#f1dfe4',
    camera: { position: [0, 10, 34], target: [0, 1.2, 0], min: 16, max: 60 },
    cloudLift: 3,
    nightDim: 0.45,
    update(env) {
      const { t, dt } = env;
      water.color.copy(env.cur.sh).lerp(env.gray, env.ov * 0.35);

      canopyTarget.set(CHERRY[env.season] || CHERRY.autumn);
      canopyCur.lerp(canopyTarget, 1 - Math.exp(-dt * 1.8));
      canopyMat.color.copy(canopyCur).lerp(new THREE.Color('#f2f5f7'), env.snowCover * 0.6);

      const sway = 0.012 + Math.min(env.wind, 50) / 1500;
      for (const c of cherries) c.userData.crown.rotation.z = Math.sin(t * 1.1 + c.userData.phase) * sway;
      for (const b of bamboo) b.rotation.z = Math.sin(t * 1.4 + b.userData.phase) * sway * 2;

      for (const f of koi) {
        const u = f.userData;
        const a = u.phase + t * u.speed;
        f.position.set(POND.x + Math.cos(a) * u.r, GROUND + 0.05, POND.z + Math.sin(a) * u.r * 0.8);
        f.rotation.y = -a + (u.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
        u.tail.rotation.y = Math.sin(t * 6 + u.phase) * 0.5;
      }
    },
  };
}
