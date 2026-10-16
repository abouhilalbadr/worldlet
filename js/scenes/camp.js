// Lake camp: a tent and campfire in a forest clearing, a canoe on the lake, fireflies on warm nights.
import { THREE, TAU, rng, smooth, mat, shadows, shapedCylinder, terrain, makeTree, makeFire, waterMat } from './kit.js';

const GROUND = 0.4;
const LAKE = { x: -2.6, z: 3.2 };
const lakeR = (a) => 4.4 + 0.7 * Math.sin(2 * a + 1.1) + 0.35 * Math.sin(4 * a + 0.2);

function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const back = smooth(10, -28, z);
  const hills = smooth(12, 40, r) * Math.min(r - 12, 45) * (0.12 + back * 0.32);
  const bumps = (Math.sin(x * 0.27) * Math.cos(z * 0.23 + 0.4) * 0.35) * smooth(9, 14, r);
  return GROUND - 0.02 + Math.max(0, hills) + bumps;
}

function makeTent() {
  const g = new THREE.Group();
  const cloth = mat('#e0702f', { side: THREE.DoubleSide }), dark = mat('#3b2a22'), pole = mat('#6e4b32');
  const W = 1.9, H = 1.4, L = 2.2;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(0, H); shape.lineTo(-W / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  const body = new THREE.Mesh(geo, cloth);
  g.add(body);
  const flap = new THREE.Shape();
  flap.moveTo(-0.38, 0); flap.lineTo(0.38, 0); flap.lineTo(0, H * 0.7); flap.lineTo(-0.38, 0);
  const door = new THREE.Mesh(new THREE.ShapeGeometry(flap), dark);
  door.position.z = L / 2 + 0.01;
  g.add(door);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, L + 0.4, 5), pole);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = H + 0.02;
  g.add(ridge);
  return shadows(g);
}

function makeCanoe() {
  const g = new THREE.Group();
  const hullGeo = new THREE.SphereGeometry(0.5, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
  hullGeo.scale(3.4, 0.55, 0.9);
  const hull = new THREE.Mesh(hullGeo, mat('#b5452f', { side: THREE.DoubleSide }));
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 12), mat('#7a5034'));
  floor.scale.set(3.0, 1, 0.75);
  floor.position.y = -0.14;
  g.add(floor);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.8), mat('#8a5c3b'));
  seat.position.y = -0.08;
  const paddle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.08), mat('#8a5c3b'));
  paddle.position.set(0.3, 0.02, 0.15);
  paddle.rotation.y = 0.4;
  g.add(hull, seat, paddle);
  return shadows(g, true, false);
}

export function build(ctx) {
  const group = new THREE.Group();
  const R = rng(512);

  group.add(terrain(ctx.grassMat, groundHeight));

  // lake with a muddy shore and a small jetty
  const water = waterMat();
  const lake = new THREE.Mesh(shapedCylinder(1, 1, 0.1, 64, lakeR), water);
  lake.position.set(LAKE.x, GROUND - 0.03, LAKE.z);
  group.add(lake);
  const shore = new THREE.Mesh(shapedCylinder(1, 1, 0.12, 64, (a) => lakeR(a) + 0.45), mat('#9a8466'));
  shore.position.set(LAKE.x, GROUND - 0.06, LAKE.z);
  shore.receiveShadow = true;
  group.add(shore);
  const jetty = new THREE.Group();
  const plank = mat('#9b7350'), post = mat('#5f412b');
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 2.6), plank);
  deck.position.y = 0.18;
  jetty.add(deck);
  for (const z of [-1.1, 0, 1.1]) for (const x of [-0.38, 0.38]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5), post);
    p.position.set(x, -0.05, z);
    jetty.add(p);
  }
  shadows(jetty);
  jetty.position.set(LAKE.x + 2.6, GROUND, LAKE.z - 1.6);
  jetty.rotation.y = 0.9;
  group.add(jetty);

  const canoe = makeCanoe();
  group.add(canoe);

  // camp: tent, fire ring, log seats, lantern pole
  const tent = makeTent();
  tent.position.set(2.8, GROUND, -2.4);
  tent.rotation.y = -0.5;
  group.add(tent);

  const FIRE = { x: 2.0, z: 0.6 };
  const ring = new THREE.Group();
  const stoneM = mat('#8a8279');
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), stoneM);
    s.position.set(Math.cos((i / 9) * TAU) * 0.5, 0.07, Math.sin((i / 9) * TAU) * 0.5);
    ring.add(s);
  }
  const logM = mat('#6b4a31');
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5), logM);
    l.rotation.z = Math.PI / 2;
    l.rotation.y = (i / 3) * Math.PI;
    l.position.y = 0.08;
    ring.add(l);
  }
  const fire = makeFire(1.1);
  ring.add(fire.group);
  ring.position.set(FIRE.x, GROUND, FIRE.z);
  group.add(shadows(ring, true, true));
  for (const [dx, dz, ry] of [[-1.3, 0.3, 0.3], [0.5, 1.4, -1.2]]) {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 7), logM);
    seat.rotation.set(0, ry, Math.PI / 2);
    seat.position.set(FIRE.x + dx, GROUND + 0.18, FIRE.z + dz);
    group.add(shadows(seat));
  }
  const lanternPole = new THREE.Group();
  const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 5), post);
  lp.position.y = 0.9;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), post);
  arm.position.set(0.18, 1.75, 0);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), ctx.windowMat);
  lantern.position.set(0.34, 1.55, 0);
  lanternPole.add(lp, arm, lantern);
  lanternPole.position.set(4.3, GROUND, -1.0);
  group.add(shadows(lanternPole, true, false));

  // fallen log and rocks
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.6, 7), logM);
  fallen.rotation.set(0, 0.8, Math.PI / 2);
  fallen.position.set(5.4, GROUND + 0.2, 2.8);
  group.add(shadows(fallen));
  const rockM = mat('#8b9096');
  for (let i = 0; i < 10; i++) {
    const a = R() * TAU, d = 5 + R() * 6;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < lakeR(Math.atan2(z - LAKE.z, x - LAKE.x)) + 0.8) continue;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + R() * 0.45, 0), rockM);
    m.position.set(x, groundHeight(x, z), z);
    m.rotation.set(R() * 3, R() * 3, R() * 3);
    m.scale.y = 0.65;
    group.add(shadows(m, true, false));
  }

  // forest ring around the clearing
  const trees = [];
  const avoid = [{ x: 2.8, z: -2.4, r: 2.2 }, { x: FIRE.x, z: FIRE.z, r: 2.4 }, { x: 4.3, z: -1.0, r: 0.8 }, { x: 5.4, z: 2.8, r: 1.6 }];
  for (let i = 0; i < 150; i++) {
    const a = R() * TAU, d = 6 + Math.sqrt(R()) * 18;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) continue;
    const la = Math.atan2(z - LAKE.z, x - LAKE.x);
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < lakeR(la) + 0.9) continue;
    if (z > 5 && Math.abs(x) < 5 + (z - 5) * 0.9) continue; // keep the view from the camera
    const tr = makeTree(ctx, R, R() < 0.6 ? 'pine' : 'leafy');
    tr.scale.setScalar((0.9 + R() * 0.8) * (d > 12 ? 1.35 : 1));
    tr.position.set(x, groundHeight(x, z) - 0.05, z);
    group.add(tr);
    trees.push(tr);
  }

  // fireflies on warm nights
  const FN = 60;
  const ffPos = new Float32Array(FN * 3);
  const ffSeed = [];
  for (let i = 0; i < FN; i++) ffSeed.push([(R() - 0.5) * 14, 0.4 + R() * 1.6, (R() - 0.5) * 12, R() * 10]);
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsMaterial({ color: '#f7ffa0', size: 0.12, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  return {
    group,
    horizonTint: '#d8e8d0',
    camera: { position: [0, 10, 34], target: [0, 1.2, 0], min: 16, max: 60 },
    cloudLift: 3,
    nightDim: 0.45,
    update(env) {
      const { t, night } = env;
      water.color.copy(env.cur.sh).lerp(env.gray, env.ov * 0.35).lerp(new THREE.Color('#d6eaf4'), smooth(0.6, 0.9, env.snowCover));

      // fire burns from dusk; rain puts it out
      fire.update(env, smooth(0.1, 0.6, night + 0.2) * (1 - smooth(0.15, 0.6, env.rain)));

      // canoe drifts slowly across the lake
      const ca = t * 0.05;
      canoe.position.set(LAKE.x - 0.7 + Math.cos(ca) * 1.5, GROUND + 0.22 + Math.sin(t * 1.3) * 0.025, LAKE.z + 0.3 + Math.sin(ca) * 1.1);
      canoe.rotation.y = -ca - Math.PI / 2;
      canoe.rotation.z = Math.sin(t * 1.1) * 0.04;

      const sway = 0.012 + Math.min(env.wind, 50) / 1700;
      for (const tr of trees) tr.rotation.z = Math.sin(t * 1.25 + tr.userData.phase) * sway;

      const warm = env.season === 'summer' || env.season === 'spring' ? 1 : 0;
      ffMat.opacity = night * warm * (1 - env.rain) * 0.9;
      fireflies.visible = ffMat.opacity > 0.02;
      if (fireflies.visible) {
        const a = ffGeo.attributes.position.array;
        for (let i = 0; i < FN; i++) {
          const s = ffSeed[i];
          a[i * 3] = s[0] + Math.sin(t * 0.4 + s[3]) * 0.8;
          a[i * 3 + 1] = GROUND + s[1] + Math.sin(t * 0.9 + s[3] * 2) * 0.25;
          a[i * 3 + 2] = s[2] + Math.cos(t * 0.35 + s[3]) * 0.8;
        }
        ffGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
