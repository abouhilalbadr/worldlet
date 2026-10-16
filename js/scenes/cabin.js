// Mountain cabin: a log cabin among pines, a lake that freezes, and peaks behind.
import { THREE, TAU, rng, smooth, mat, shadows, shapedCylinder, terrain, makeTree, Smoke, waterMat } from './kit.js';

const GROUND = 0.5;
const lakeR = (a) => 3.0 + 0.45 * Math.sin(2 * a + 0.8) + 0.25 * Math.sin(5 * a + 1.7);
const LAKE = { x: -3.6, z: 3.4 };

function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  // slopes rise behind the cabin only, so the camera side stays open
  const back = smooth(12, -30, z);
  const rise = smooth(14, 40, r) * Math.min(r - 14, 50) * 0.24 * back;
  const bumps = (Math.sin(x * 0.31 + 0.7) * Math.cos(z * 0.27) * 0.5 + Math.sin((x - z) * 0.17) * 0.4) * smooth(9, 15, r);
  return GROUND - 0.02 + Math.max(0, rise) + bumps;
}

function makeCabin(ctx, snowMat) {
  const g = new THREE.Group();
  const log = mat('#7a5232'), logDark = mat('#5f3f27'), stone = mat('#8d8a86'), roofM = mat('#5b4134');
  const W = 3.0, D = 2.4, rows = 7, r = 0.13;
  const logGeoW = new THREE.CylinderGeometry(r, r, W + 0.35, 6);
  logGeoW.rotateZ(Math.PI / 2);
  const logGeoD = new THREE.CylinderGeometry(r, r, D + 0.35, 6);
  logGeoD.rotateX(Math.PI / 2);
  for (let i = 0; i < rows; i++) {
    const y = r + i * r * 1.9;
    const m = i % 2 ? logDark : log;
    for (const z of [-D / 2, D / 2]) { const l = new THREE.Mesh(logGeoW, m); l.position.set(0, y, z); g.add(l); }
    for (const x of [-W / 2, W / 2]) { const l = new THREE.Mesh(logGeoD, m); l.position.set(x, y + r * 0.95, 0); g.add(l); }
  }
  const H = rows * r * 1.9 + r;
  const fill = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, H, D - 0.1), logDark);
  fill.position.y = H / 2;
  g.add(fill);

  // steep gabled roof with a snow layer that thickens with snow cover
  const o = 0.35, rh = 1.5;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2 - o, 0); shape.lineTo(W / 2 + o, 0); shape.lineTo(0, rh); shape.lineTo(-W / 2 - o, 0);
  const rg = new THREE.ExtrudeGeometry(shape, { depth: D + o * 2, bevelEnabled: false });
  rg.translate(0, 0, -(D + o * 2) / 2);
  const roof = new THREE.Mesh(rg, roofM);
  roof.position.y = H;
  g.add(roof);
  const sg = new THREE.ExtrudeGeometry(shape, { depth: D + o * 2 + 0.06, bevelEnabled: false });
  sg.translate(0, 0, -(D + o * 2 + 0.06) / 2);
  const snowRoof = new THREE.Mesh(sg, snowMat);
  snowRoof.position.y = H + 0.06;
  snowRoof.scale.set(1.02, 1.02, 1);
  g.add(snowRoof);

  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 0.45), stone);
  chim.position.set(W * 0.28, H + 0.7, -D * 0.15);
  g.add(chim);

  // door, windows, porch
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.08), mat('#3e2a1d'));
  door.position.set(-0.6, 0.45, D / 2 + 0.12);
  g.add(door);
  const wg = new THREE.BoxGeometry(0.45, 0.4, 0.08);
  const w1 = new THREE.Mesh(wg, ctx.windowMat); w1.position.set(0.55, 0.85, D / 2 + 0.12); g.add(w1);
  const w2 = new THREE.Mesh(wg, ctx.windowMat); w2.position.set(W / 2 + 0.12, 0.85, 0); w2.rotation.y = Math.PI / 2; g.add(w2);
  const w3 = new THREE.Mesh(wg, ctx.windowMat); w3.position.set(-W / 2 - 0.12, 0.85, 0.3); w3.rotation.y = Math.PI / 2; g.add(w3);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.1, 0.9), log);
  deck.position.set(0, 0.05, D / 2 + 0.55);
  g.add(deck);
  for (const x of [-W / 2 - 0.1, W / 2 + 0.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5), logDark);
    post.position.set(x, 0.65, D / 2 + 0.95);
    g.add(post);
  }
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), ctx.windowMat);
  lantern.position.set(-1.05, 1.15, D / 2 + 0.2);
  g.add(lantern);

  shadows(g);
  g.userData.chimney = new THREE.Vector3(W * 0.28, H + 1.6, -D * 0.15);
  return g;
}

function makeSnowman(snowMat) {
  const g = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), snowMat); b1.position.y = 0.38;
  const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), snowMat); b2.position.y = 0.95;
  const b3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 1), snowMat); b3.position.y = 1.38;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 5), mat('#e8792b'));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.38, 0.28);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 5, 10), mat('#c8413a'));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.17;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.25, 8), mat('#2c2f36'));
  hat.position.y = 1.65;
  g.add(b1, b2, b3, nose, scarf, hat);
  return shadows(g, true, false);
}

export function build(ctx) {
  const group = new THREE.Group();
  const R = rng(123);
  const snowMat = mat('#f2f6f9');

  group.add(terrain(ctx.grassMat, groundHeight));

  // lake that freezes over as snow cover rises
  const water = waterMat();
  const lake = new THREE.Mesh(shapedCylinder(1, 1, 0.1, 48, lakeR), water);
  lake.position.set(LAKE.x, GROUND + 0.0, LAKE.z);
  group.add(lake);
  const shore = new THREE.Mesh(shapedCylinder(1, 1, 0.12, 48, (a) => lakeR(a) + 0.35), mat('#8f8a80'));
  shore.position.set(LAKE.x, GROUND - 0.05, LAKE.z);
  shore.receiveShadow = true;
  group.add(shore);
  const ice = new THREE.Color('#d6eaf4');

  const cabin = makeCabin(ctx, snowMat);
  cabin.position.set(1.6, GROUND, -1.8);
  cabin.rotation.y = -0.35;
  group.add(cabin);
  cabin.updateMatrixWorld();
  const smoke = new Smoke(group, [cabin.localToWorld(cabin.userData.chimney.clone())], { color: '#eef0f2', size: 0.2, rise: 2.2 });
  const snowRoof = cabin.children.find((c) => c.material === snowMat);

  // woodpile
  const pile = new THREE.Group();
  const logM = mat('#8a5f3c');
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 6), logM);
      l.rotation.x = Math.PI / 2;
      l.position.set((i - (3 - row) / 2) * 0.23, 0.11 + row * 0.2, 0);
      pile.add(l);
    }
  }
  shadows(pile);
  pile.position.set(4.0, GROUND, -0.6);
  pile.rotation.y = -0.4;
  group.add(pile);

  const snowman = makeSnowman(snowMat);
  snowman.position.set(0.2, GROUND, 2.6);
  snowman.rotation.y = 0.3;
  group.add(snowman);

  // forest: dense pines around the clearing, a few leafy trees for the seasons
  const trees = [];
  const avoid = [{ x: 1.6, z: -1.8, r: 3.2 }, { x: LAKE.x, z: LAKE.z, r: 4.0 }, { x: 0.2, z: 2.6, r: 1.0 }, { x: 4.0, z: -0.6, r: 1.0 }];
  for (let i = 0; i < 110; i++) {
    const a = R() * TAU, d = 3 + Math.sqrt(R()) * 17;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) continue;
    if (d < 9 && R() < 0.55) continue; // keep the clearing open
    if (z > 4 && Math.abs(x) < 5 + (z - 4) * 0.9) continue; // and the view from the camera
    const tr = makeTree(ctx, R, R() < 0.93 ? 'pine' : 'leafy');
    tr.scale.setScalar((0.8 + R() * 0.7) * (d > 11 ? 1.3 : 1));
    tr.position.set(x, groundHeight(x, z) - 0.05, z);
    group.add(tr);
    trees.push(tr);
  }

  // pines climbing the slope behind the cabin
  for (let i = 0; i < 130; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.6, d = 16 + R() * 34;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const tr = makeTree(ctx, R, 'pine');
    tr.scale.setScalar(1.3 + R() * 0.9);
    tr.position.set(x, groundHeight(x, z) - 0.1, z);
    group.add(tr);
  }

  // rocks
  const rockM = mat('#8a9097');
  for (let i = 0; i < 12; i++) {
    const a = R() * TAU, d = 5 + R() * 8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + R() * 0.5, 0), rockM);
    m.position.set(x, groundHeight(x, z), z);
    m.rotation.set(R() * 3, R() * 3, R() * 3);
    m.scale.y = 0.65;
    group.add(shadows(m, true, false));
  }

  // mountains with snow caps
  const rock = mat('#7c838c');
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i / 11 - 0.5) * 3.6 + R() * 0.3; // mostly behind the cabin
    const d = 120 + R() * 60, H = 34 + R() * 26, rad = 22 + R() * 14;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const base = groundHeight(x, z) - 2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, H, 6 + Math.floor(R() * 3)), rock);
    m.position.set(x, base + H / 2, z);
    m.rotation.y = R() * 3;
    group.add(m);
    const capH = H * 0.38;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.4, capH, m.geometry.parameters.radialSegments), snowMat);
    cap.position.set(x, base + H - capH / 2 + 0.3, z);
    cap.rotation.y = m.rotation.y;
    cap.scale.setScalar(1.02);
    group.add(cap);
  }

  return {
    group,
    horizonTint: '#dfe9f2',
    camera: { position: [0, 9.5, 33], target: [0, 1.2, 0], min: 16, max: 58 },
    cloudLift: 4,
    nightDim: 0.25,
    // Snow lies most of the year up here; summer melts it.
    snowCover: (season, snow) => Math.max({ winter: 0.95, autumn: 0.75, spring: 0.55, summer: 0.0 }[season] ?? 0.75, smooth(0.2, 0.8, snow) * 0.85),
    update(env) {
      const { t, night, snowCover } = env;
      water.color.copy(env.cur.sh).lerp(env.gray, env.ov * 0.35).lerp(ice, smooth(0.45, 0.8, snowCover));
      if (snowRoof) snowRoof.visible = snowCover > 0.2;
      snowman.visible = snowCover > 0.45;
      snowman.scale.setScalar(smooth(0.45, 0.7, snowCover));
      smoke.update(env, env.season !== 'summer' || night > 0.3);
      const sway = 0.012 + Math.min(env.wind, 50) / 1800;
      for (const tr of trees) tr.rotation.z = Math.sin(t * 1.2 + tr.userData.phase) * sway;
    },
  };
}
