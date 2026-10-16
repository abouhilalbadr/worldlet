// Desert oasis: a clay kasbah, palms around a pool, camels and a campfire among the dunes.
import { THREE, TAU, rng, smooth, mat, shadows, shapedCylinder, terrain, makeFire, waterMat } from './kit.js';

const GROUND = 0.3;
const FLAT = 10; // radius of the flat oasis floor

function duneHeight(x, z) {
  const r = Math.hypot(x, z);
  const k = smooth(FLAT - 1, FLAT + 7, r);
  const amp = 1.3 + Math.min(r, 90) / 11;
  const h =
    Math.sin(x * 0.11 + Math.cos(z * 0.07) * 1.6) * 0.9 +
    Math.sin((x + z) * 0.19 + 1.3) * 0.45 +
    Math.cos(z * 0.13 - x * 0.05) * 0.6;
  return GROUND - 0.02 + k * amp * (0.55 + 0.45 * h);
}

const poolR = (a) => 2.3 + 0.35 * Math.sin(3 * a + 0.4) + 0.2 * Math.sin(5 * a + 2.1);

function makePalm(R, frondMat, trunkMat, height = 3) {
  const g = new THREE.Group();
  const n = 7, lean = 0.35 + R() * 0.6, dir = R() * TAU;
  let prev = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const segH = height / n;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - t1 * 0.04, 0.14 - t0 * 0.04, segH * 1.05, 6), trunkMat);
    const x1 = Math.cos(dir) * lean * t1 * t1, z1 = Math.sin(dir) * lean * t1 * t1;
    const top = new THREE.Vector3(x1, height * t1, z1);
    seg.position.copy(prev).lerp(top, 0.5);
    seg.lookAt(top);
    seg.rotateX(Math.PI / 2);
    g.add(seg);
    prev = top;
  }
  const crown = new THREE.Group();
  crown.position.copy(prev);
  const leafGeo = new THREE.PlaneGeometry(0.42, 1.7, 1, 5);
  leafGeo.rotateX(-Math.PI / 2);
  leafGeo.translate(0, 0, 0.85);
  const p = leafGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setX(i, p.getX(i) * (1 - z / 1.9));
    p.setY(i, -0.22 * z * z);
  }
  leafGeo.computeVertexNormals();
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const leaf = new THREE.Mesh(leafGeo, frondMat);
    leaf.rotation.y = (i / fronds) * TAU + R() * 0.3;
    leaf.rotation.x = -0.15 + R() * 0.2;
    crown.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat('#6b4a2a'));
  nut.position.y = -0.08;
  crown.add(nut);
  g.add(crown);
  g.userData = { crown, phase: R() * 10 };
  return shadows(g);
}

function makeCamel(fur, dark) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), fur);
  body.scale.set(1.5, 0.8, 0.75);
  body.position.y = 1.05;
  const hump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), fur);
  hump.scale.set(1.1, 0.9, 0.9);
  hump.position.set(-0.05, 1.42, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.75, 5), fur);
  neck.position.set(0.62, 1.32, 0);
  neck.rotation.z = -0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.16), fur);
  head.position.set(0.9, 1.62, 0);
  const legs = [];
  for (const [lx, lz] of [[0.38, 0.14], [0.38, -0.14], [-0.38, 0.14], [-0.38, -0.14]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.82, lz);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), fur);
    leg.position.y = -0.41;
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), dark);
    hoof.position.y = -0.8;
    pivot.add(leg, hoof);
    g.add(pivot);
    legs.push(pivot);
  }
  g.add(body, hump, neck, head);
  g.userData.legs = legs;
  return shadows(g, true, false);
}

function makeKasbah(ctx) {
  const g = new THREE.Group();
  const clay = mat('#c98a5b'), clayDark = mat('#a96a43'), door = mat('#4a2f22');
  const W = 4.2, D = 3.2, H = 2.3;
  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), clay);
  main.position.y = H / 2;
  g.add(main);
  // decorative band and crenellations
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.14, D + 0.04), clayDark);
  band.position.y = H - 0.35;
  g.add(band);
  const merlon = new THREE.BoxGeometry(0.22, 0.26, 0.22);
  for (let i = 0; i <= 8; i++) {
    const x = -W / 2 + (i / 8) * W;
    for (const z of [-D / 2, D / 2]) { const m = new THREE.Mesh(merlon, clay); m.position.set(x, H + 0.13, z); g.add(m); }
  }
  for (let i = 1; i < 6; i++) {
    const z = -D / 2 + (i / 6) * D;
    for (const x of [-W / 2, W / 2]) { const m = new THREE.Mesh(merlon, clay); m.position.set(x, H + 0.13, z); g.add(m); }
  }
  // corner towers: tapered square
  const towerGeo = new THREE.CylinderGeometry(0.55, 0.75, 3.4, 4);
  towerGeo.rotateY(Math.PI / 4);
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const t = new THREE.Mesh(towerGeo, clay);
    t.position.set(x, 1.7, z);
    g.add(t);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.86), clayDark);
    tb.position.set(x, 3.05, z);
    g.add(tb);
    for (const [mx, mz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const m = new THREE.Mesh(merlon, clay);
      m.position.set(x + mx, 3.52, z + mz);
      g.add(m);
    }
    const tw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.06), ctx.windowMat);
    tw.position.set(x, 2.5, z + Math.sign(z) * 0.62);
    g.add(tw);
  }
  // arched door
  const dBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.08), door);
  dBox.position.set(0, 0.45, D / 2 + 0.02);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10, 1, false, 0, Math.PI), door);
  arch.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  arch.position.set(0, 0.9, D / 2 + 0.02);
  g.add(dBox, arch);
  // windows
  const wg = new THREE.BoxGeometry(0.2, 0.3, 0.06);
  for (const x of [-1.3, -0.7, 0.7, 1.3]) {
    const w = new THREE.Mesh(wg, ctx.windowMat);
    w.position.set(x, 1.55, D / 2 + 0.02);
    g.add(w);
  }
  for (const z of [-0.6, 0.6]) {
    const w = new THREE.Mesh(wg, ctx.windowMat);
    w.position.set(W / 2 + 0.02, 1.5, z);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  }
  return shadows(g);
}

export function build(ctx) {
  const group = new THREE.Group();
  const R = rng(91);
  const white = new THREE.Color('#f4f6f8');

  const sandBase = new THREE.Color('#dba567');
  const sandMat = mat(sandBase.clone());
  group.add(terrain(sandMat, duneHeight));

  // oasis: grass rim and pool
  const rim = new THREE.Mesh(shapedCylinder(1, 1, 0.12, 48, (a) => poolR(a) + 1.1), ctx.grassMat);
  rim.position.set(1.5, GROUND - 0.03, 1.8);
  rim.receiveShadow = true;
  group.add(rim);
  const water = waterMat();
  const pool = new THREE.Mesh(shapedCylinder(1, 1, 0.1, 48, poolR), water);
  pool.position.set(1.5, GROUND + 0.01, 1.8);
  group.add(pool);

  const kasbah = makeKasbah(ctx);
  kasbah.position.set(-2.6, GROUND, -4.4);
  kasbah.rotation.y = 0.35;
  group.add(kasbah);

  // low clay wall linking the kasbah to a gate
  const wallMat = mat('#c98a5b');
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6 + (i % 2) * 0.1, 0.3), wallMat);
    const a = -2.5 + i * 0.32;
    seg.position.set(Math.cos(a) * 8.2, GROUND + 0.3, Math.sin(a) * 8.2);
    seg.rotation.y = -a + Math.PI / 2;
    group.add(shadows(seg));
  }

  // palms around the pool
  const frondMat = mat('#5f9a3c', { side: THREE.DoubleSide });
  const palmTrunk = mat('#8a6a45');
  const palms = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + R() * 0.4;
    const d = poolR(a) + 0.9 + R() * 1.4;
    const p = makePalm(R, frondMat, palmTrunk, 2.4 + R() * 1.6);
    p.position.set(1.5 + Math.cos(a) * d, GROUND, 1.8 + Math.sin(a) * d);
    group.add(p);
    palms.push(p);
  }
  for (const [x, z] of [[6.5, -3.5], [-6.8, 2.5], [5.8, 5.6]]) {
    const p = makePalm(R, frondMat, palmTrunk, 3 + R());
    p.position.set(x, GROUND, z);
    group.add(p);
    palms.push(p);
  }

  // tent and fire pit
  const tent = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.1, 4), mat('#7d4b38'));
  cloth.scale.set(1.4, 1, 1);
  cloth.position.y = 0.55;
  cloth.rotation.y = Math.PI / 4;
  const stripe = new THREE.Mesh(new THREE.ConeGeometry(1.32, 0.18, 4, 1, true), mat('#e8cf9a', { side: THREE.DoubleSide }));
  stripe.scale.set(1.4, 1, 1);
  stripe.position.y = 0.35;
  stripe.rotation.y = Math.PI / 4;
  tent.add(cloth, stripe);
  shadows(tent);
  tent.position.set(5.2, GROUND, -1.2);
  tent.rotation.y = -0.6;
  group.add(tent);
  const pit = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), mat('#8a8279'));
    s.position.set(Math.cos((i / 7) * TAU) * 0.42, 0.06, Math.sin((i / 7) * TAU) * 0.42);
    pit.add(s);
  }
  const fire = makeFire(1);
  pit.add(fire.group);
  pit.position.set(4.6, GROUND, 1.0);
  group.add(pit);

  // camels: one resting by the tent, one walking a slow loop
  const fur = mat('#c49a62'), hoofM = mat('#5b4632');
  const resting = makeCamel(fur, hoofM);
  resting.userData.legs.forEach((l) => (l.visible = false));
  resting.position.set(6.4, GROUND - 0.62, 0.9);
  resting.rotation.y = 2.2;
  group.add(resting);
  const walker = makeCamel(fur, hoofM);
  group.add(walker);

  // scattered rocks and distant mesas
  const rockM = mat('#b98a64');
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, d = 9 + R() * 6;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + R() * 0.5, 0), rockM);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m.position.set(x, duneHeight(x, z) - 0.05, z);
    m.rotation.set(R() * 3, R() * 3, R() * 3);
    m.scale.y = 0.6;
    group.add(shadows(m, true, false));
  }
  const mesaM = mat('#c77d55');
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, d = 120 + R() * 70;
    const h = 10 + R() * 14, r = 7 + R() * 9;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h, 6 + Math.floor(R() * 3)), mesaM);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m.position.set(x, duneHeight(x, z) + h / 2 - 1, z);
    m.rotation.y = R() * 3;
    group.add(m);
  }

  return {
    group,
    horizonTint: '#f3cf9c',
    camera: { position: [0, 10, 37], target: [0, 1.4, 0], min: 18, max: 64 },
    cloudLift: 3,
    // Snow only ever dusts the dunes here, even in winter.
    snowCover: (_season, snow) => smooth(0.2, 0.8, snow) * 0.45,
    update(env) {
      const { t, night } = env;
      sandMat.color.copy(sandBase).lerp(white, env.snowCover * 0.7);
      water.color.copy(env.cur.sh).lerp(env.gray, env.ov * 0.35);

      const sway = 0.02 + Math.min(env.wind, 50) / 900;
      for (const p of palms) {
        p.userData.crown.rotation.z = Math.sin(t * 1.1 + p.userData.phase) * sway;
        p.userData.crown.rotation.x = Math.cos(t * 0.9 + p.userData.phase) * sway * 0.6;
      }

      // fire burns from dusk, dies down in rain
      fire.update(env, smooth(0.15, 0.7, night + 0.25) * (1 - smooth(0.2, 0.7, env.rain)));

      const ang = t * 0.045;
      const rad = 7.2;
      walker.position.set(Math.cos(ang) * rad, GROUND, Math.sin(ang) * rad);
      walker.rotation.y = -ang - Math.PI;
      walker.userData.legs.forEach((l, i) => {
        l.rotation.z = Math.sin(t * 3.2 + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.35;
      });
      walker.position.y = GROUND + Math.abs(Math.sin(t * 3.2)) * 0.03;
    },
  };
}
