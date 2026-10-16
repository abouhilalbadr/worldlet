// Shared building blocks for scene sets.
import * as THREE from '../../lib/three.module.min.js';

export { THREE };
export const TAU = Math.PI * 2;

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts });
}

export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

// Cylinder whose outline follows radiusFn(angle); used for islands, plateaus and ponds.
export function shapedCylinder(rTop, rBot, h, seg, radiusFn, jitter = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, Math.max(1, Math.round(h * 2)));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    let k = radiusFn(a);
    if (jitter && Math.hypot(x, z) > 0.01) {
      k += jitter * (Math.sin(a * 17 + y * 5.3) * 0.6 + Math.sin(a * 31 + y * 9.1) * 0.4);
    }
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Large faceted ground disc that fades into the fog. heightFn(x, z) shapes it.
export function terrain(material, heightFn, radius = 420, rings = 80, segs = 120) {
  const geo = new THREE.RingGeometry(0.0001, 1, segs, rings);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const r = Math.hypot(x, y);
    // denser near the centre where the set sits
    const s = r > 0 ? (r * r * radius) / r : 0;
    p.setXY(i, x * s, y * s);
  }
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < p.count; i++) p.setY(i, heightFn(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

// Deciduous or pine tree using the world's seasonal materials.
export function makeTree(ctx, R, kind = R() < 0.35 ? 'pine' : 'leafy') {
  const g = new THREE.Group();
  if (kind === 'pine') {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 5), ctx.trunkMat);
    t.position.y = 0.2;
    g.add(t);
    const layers = 2 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < layers; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.55 - k * 0.13, 0.85, 7), k % 2 ? ctx.pineMat2 : ctx.pineMat);
      c.position.y = 0.6 + k * 0.42;
      c.rotation.y = R() * 3;
      g.add(c);
    }
  } else {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 5), ctx.trunkMat);
    t.position.y = 0.35;
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + R() * 0.25, 0), ctx.leafMats[Math.floor(R() * 4)]);
    f.position.y = 0.95;
    f.rotation.set(R() * 3, R() * 3, R() * 3);
    g.add(t, f);
    if (R() < 0.4) {
      const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), f.material);
      f2.position.set(0.25, 1.25, 0.1);
      g.add(f2);
    }
  }
  g.rotation.y = R() * TAU;
  g.userData.phase = R() * 10;
  return shadows(g);
}

// Gabled cottage with lit windows; userData.chimney is the smoke origin in local space.
export function makeHouse(ctx, w, d, h, wall, roofColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wall));
  body.position.y = h / 2;
  const o = 0.18, rh = w * 0.55;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - o, 0); shape.lineTo(w / 2 + o, 0); shape.lineTo(0, rh); shape.lineTo(-w / 2 - o, 0);
  const rg = new THREE.ExtrudeGeometry(shape, { depth: d + o * 2, bevelEnabled: false });
  rg.translate(0, 0, -(d + o * 2) / 2);
  const roof = new THREE.Mesh(rg, mat(roofColor));
  roof.position.y = h;
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), mat('#9a8a7a'));
  chim.position.set(w * 0.22, h + rh * 0.55, -d * 0.2);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.06), mat('#7a5638'));
  door.position.set(-w * 0.18, 0.25, d / 2 + 0.02);
  g.add(body, roof, chim, door);
  const wg = new THREE.BoxGeometry(0.22, 0.24, 0.06);
  const w1 = new THREE.Mesh(wg, ctx.windowMat); w1.position.set(w * 0.2, h * 0.58, d / 2 + 0.02);
  const w2 = new THREE.Mesh(wg, ctx.windowMat); w2.position.set(w / 2 + 0.02, h * 0.58, 0); w2.rotation.y = Math.PI / 2;
  const w3 = new THREE.Mesh(wg, ctx.windowMat); w3.position.set(-w / 2 - 0.02, h * 0.58, 0); w3.rotation.y = Math.PI / 2;
  g.add(w1, w2, w3);
  g.userData.chimney = new THREE.Vector3(w * 0.22, h + rh * 0.55 + 0.35, -d * 0.2);
  g.userData.roof = roof;
  return shadows(g);
}

// Rising puffs from a list of world-space points.
export class Smoke {
  constructor(group, points, { color = '#f4f4f4', size = 0.16, rise = 1.6 } = {}) {
    this.rise = rise;
    this.puffs = [];
    const geo = new THREE.IcosahedronGeometry(size, 0);
    const base = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.6, flatShading: true, depthWrite: false });
    for (const c of points) {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(geo, base.clone());
        m.userData = { base: c, t: i / 4 };
        group.add(m);
        this.puffs.push(m);
      }
    }
  }
  update(env, visible = true) {
    for (const s of this.puffs) {
      const u = s.userData;
      u.t = (u.t + env.dt * 0.18) % 1;
      const b = u.base;
      s.position.set(b.x + u.t * 0.6 * Math.min(2, env.wind / 15 + 0.3), b.y + u.t * this.rise, b.z + Math.sin(u.t * 6 + b.x) * 0.15);
      s.scale.setScalar(0.45 + u.t * 1.1);
      s.material.opacity = 0.6 * (1 - u.t) * Math.min(1, u.t * 6);
      s.visible = visible;
    }
  }
}

// Flat water surface that takes its tint from the sky's shallow/deep colours.
export function waterMat() {
  return mat('#5cc3d6', { roughness: 0.25, metalness: 0.1 });
}

// Small flickering fire (campfire, lanterns). Returns { group, update(env, strength) }.
export function makeFire(scale = 1) {
  const g = new THREE.Group();
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 2, flatShading: true, transparent: true, opacity: 0.95 });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 * scale * (1 - i * 0.22), 0.5 * scale * (1 - i * 0.15), 5), flameMat);
    f.position.set((i - 1) * 0.08 * scale, 0.25 * scale, ((i * 7) % 3 - 1) * 0.05 * scale);
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight('#ff9a4a', 0, 9 * scale, 1.6);
  light.position.y = 0.5 * scale;
  g.add(light);
  return {
    group: g,
    update(env, strength = 1) {
      const t = env.t;
      flames.forEach((f, i) => {
        const k = 0.85 + 0.25 * Math.sin(t * (9 + i * 3) + i * 2) * Math.sin(t * 5.3 + i);
        f.scale.set(strength, k * strength, strength);
      });
      g.visible = strength > 0.02;
      light.intensity = strength * (2 + env.night * 10) * (0.85 + 0.15 * Math.sin(t * 13));
    },
  };
}

export function disposeTree(root, keep) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) if (!keep.has(m)) { m.map?.dispose(); m.dispose(); }
  });
}
