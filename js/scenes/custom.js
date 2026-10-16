// Draws a scene description made by the user's AI assistant (already checked by custom-scene.js).
import { THREE, TAU, rng, smooth, mat, shadows, shapedCylinder, terrain } from './kit.js';
import { makeOcean } from './island.js';

const GROUND = 0.5;
const DEG = Math.PI / 180;

export function build(ctx) {
  const data = ctx.data;
  if (!data || !Array.isArray(data.objects)) throw new Error('No custom scene to draw');
  const group = new THREE.Group();
  const R = rng(2024);
  const animated = [];
  const glowMats = [];
  let ocean = null;

  /* ground */
  const groundMat = (c) => (c === 'grass' ? ctx.grassMat : mat(c));
  const gr = data.ground;
  if (gr.type === 'island') {
    const rad = gr.radius;
    const outline = (a) => rad + 0.5 * Math.sin(3 * a + 0.5) + 0.3 * Math.sin(5 * a + 1.3);
    const top = new THREE.Mesh(shapedCylinder(1, 0.985, 0.5, 96, outline), [mat('#8b5b3a'), groundMat(gr.color), mat('#8b5b3a')]);
    top.position.y = GROUND - 0.25;
    group.add(shadows(top));
    const body = new THREE.Mesh(shapedCylinder(0.985, 0.72, 2.2, 96, outline, 0.18), mat('#6c4a33'));
    body.position.y = -1.1;
    group.add(shadows(body));
    const beach = new THREE.Mesh(shapedCylinder(1, 1.06, 0.36, 128, (a) => outline(a) + 0.8), mat('#ecd5a3'));
    beach.position.y = -0.11;
    beach.receiveShadow = true;
    group.add(beach);
    ocean = makeOcean(`float shoreR(float a){ return ${(rad + 0.8).toFixed(2)} + 0.5*sin(3.0*a+0.5) + 0.3*sin(5.0*a+1.3); }`);
    group.add(ocean.mesh);
  } else if (gr.type === 'water') {
    ocean = makeOcean('float shoreR(float a){ return -100.0; }');
    group.add(ocean.mesh);
  } else if (gr.type === 'plain') {
    const rad = gr.radius;
    const h = (x, z) => GROUND - 0.02 + smooth(rad, rad + 25, Math.hypot(x, z)) * (Math.sin(x * 0.09) * Math.cos(z * 0.07) + 1) * 2.5;
    group.add(terrain(groundMat(gr.color), h));
  }

  /* materials and geometry, shared between identical shapes */
  const matCache = new Map();
  let leafIdx = 0;
  function material(color, glow) {
    if (color === 'grass') return ctx.grassMat;
    if (color === 'pine') return ctx.pineMat;
    if (color === 'window') return ctx.windowMat;
    if (color === 'leaves') return ctx.leafMats[leafIdx++ % ctx.leafMats.length];
    const key = color + (glow ? ':glow' : '');
    if (!matCache.has(key)) {
      const m = glow ? mat(color, { emissive: color, emissiveIntensity: 0.15 }) : mat(color);
      if (glow) glowMats.push(m);
      matCache.set(key, m);
    }
    return matCache.get(key);
  }
  const geoCache = new Map();
  function geometry(o) {
    const key = JSON.stringify([o.shape, o.size, o.radius, o.radiusTop, o.height, o.tube]);
    if (geoCache.has(key)) return geoCache.get(key);
    let g;
    switch (o.shape) {
      case 'box': g = new THREE.BoxGeometry(...o.size); break;
      case 'sphere': g = new THREE.IcosahedronGeometry(o.radius, 1); break;
      case 'cylinder': g = new THREE.CylinderGeometry(o.radiusTop, o.radius, o.height, 8); break;
      case 'cone': g = new THREE.ConeGeometry(o.radius, o.height, 7); break;
      case 'pyramid': g = new THREE.ConeGeometry(o.radius, o.height, 4); g.rotateY(Math.PI / 4); break;
      case 'torus': g = new THREE.TorusGeometry(o.radius, o.tube, 6, 16); break;
    }
    geoCache.set(key, g);
    return g;
  }

  function single(o) {
    const node = new THREE.Group();
    if (o.shape !== 'group') {
      const m = new THREE.Mesh(geometry(o), material(o.color, o.glow));
      node.add(shadows(m));
    }
    if (o.children) for (const c of o.children) node.add(place(c));
    node.rotation.set(o.rotation[0] * DEG, o.rotation[1] * DEG, o.rotation[2] * DEG);
    node.scale.set(...o.scale);
    if (o.animate) animated.push({ node, a: o.animate, phase: R() * TAU });
    return node;
  }

  // An object, or its ring/scatter copies, placed at its position.
  function place(o) {
    const holder = new THREE.Group();
    holder.position.set(...o.position);
    if (!o.repeat) {
      holder.add(single(o));
    } else {
      const { pattern, count, radius } = o.repeat;
      for (let i = 0; i < count; i++) {
        const n = single(o);
        let a, d;
        if (pattern === 'ring') { a = (i / count) * TAU; d = radius; }
        else { a = R() * TAU; d = Math.sqrt(R()) * radius; n.rotation.y += R() * TAU; n.scale.multiplyScalar(0.8 + R() * 0.4); }
        n.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
        if (pattern === 'ring') n.rotation.y += -a;
        holder.add(n);
      }
    }
    return holder;
  }

  for (const o of data.objects) group.add(place(o));
  for (const it of animated) it.node.userData.base = { p: it.node.position.clone(), r: it.node.rotation.clone(), s: it.node.scale.clone() };

  return {
    group,
    cloudLift: 2,
    nightDim: gr.type === 'plain' ? 0.4 : 0,
    update(env) {
      const { t, night } = env;
      ocean?.update(env);
      for (const m of glowMats) m.emissiveIntensity = 0.15 + night * 2.2;
      const wind = 1 + Math.min(env.wind, 50) / 25;
      for (const { node, a, phase } of animated) {
        const b = node.userData.base;
        const sp = a.speed, k = a.amount;
        switch (a.type) {
          case 'spin': node.rotation.y = b.r.y + t * sp * 0.6; break;
          case 'bob': node.position.y = b.p.y + Math.sin(t * sp * 1.5 + phase) * 0.15 * k; break;
          case 'sway': node.rotation.z = b.r.z + Math.sin(t * sp * 1.2 + phase) * 0.035 * k * wind; break;
          case 'pulse': node.scale.copy(b.s).multiplyScalar(1 + Math.sin(t * sp * 2 + phase) * 0.08 * k); break;
          case 'orbit': {
            const ang = t * sp * 0.2;
            const c = Math.cos(ang), s = Math.sin(ang);
            node.position.set(b.p.x * c - b.p.z * s, b.p.y + Math.sin(t + phase) * 0.05 * k, b.p.x * s + b.p.z * c);
            node.rotation.y = b.r.y - ang;
            break;
          }
        }
      }
    },
  };
}
