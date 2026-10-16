// The original scene: a lighthouse island with a village, windmill, sheep and a dock.
import { THREE, TAU, rng, lerp, mat, shadows, shapedCylinder, makeTree, makeHouse, Smoke, waterMat } from './kit.js';

const islandR = (a) => 8 + 1.0 * Math.sin(3 * a + 0.5) + 0.6 * Math.sin(5 * a + 1.3) + 0.35 * Math.sin(9 * a + 2.0);
const beachR = (a) => islandR(a) + 0.7 + 0.9 * Math.max(0, Math.sin(2 * a + 1.0));
const GROUND = 0.5;

// Same outline in GLSL, for the shoreline foam.
const GLSL_SHORE = `
  float islR(float a){ return 8.0 + 1.0*sin(3.0*a+0.5) + 0.6*sin(5.0*a+1.3) + 0.35*sin(9.0*a+2.0); }
  float shoreR(float a){ return islR(a) + 0.7 + 0.9*max(0.0, sin(2.0*a+1.0)); }`;

// Animated sea with foam along a shoreline. Exported so other sets can sit in water.
export function makeOcean(glslShore = GLSL_SHORE) {
  const geo = new THREE.RingGeometry(0.0001, 1, 200, 110);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const r = Math.hypot(x, y);
    const s = r > 0 ? (r * r * 420) / r : 0;
    p.setXY(i, x * s, y * s);
  }
  geo.rotateX(-Math.PI / 2);
  const U = {
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uShallow: { value: new THREE.Color('#8be6da') },
    uDeep: { value: new THREE.Color('#2b80c2') },
    uFoam: { value: 1 },
  };
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.32, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uAmp; varying vec3 vW;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wp = (modelMatrix * vec4(transformed,1.0)).xyz;
        float w = sin(wp.x*0.33 + uTime*1.05)*0.13 + sin(wp.z*0.41 - uTime*0.85)*0.11 + sin((wp.x+wp.z)*0.9 + uTime*1.9)*0.05 + sin((wp.x-wp.z)*1.7 - uTime*2.3)*0.025;
        float d = length(wp.xz);
        transformed.y += w * uAmp * smoothstep(6.0, 12.0, d);
        vW = wp;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uFoam; varying vec3 vW;\n${glslShore}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float a = atan(vW.z, vW.x);
        float dist = length(vW.xz);
        float rel = dist - shoreR(a);
        vec3 mid = mix(uShallow, uDeep, 0.45);
        vec3 col = mix(uShallow, mid, smoothstep(-0.5, 3.0, rel));
        col = mix(col, uDeep, smoothstep(2.5, 14.0, rel));
        float foam = (1.0 - smoothstep(-0.2, 0.8, rel)) * (0.55 + 0.45*sin(uTime*1.6 + dist*2.4));
        foam += (1.0 - smoothstep(0.0, 0.15, abs(rel - 1.4 - 0.35*sin(uTime*0.8 + a*3.0)))) * 0.35;
        col = mix(col, vec3(1.0), clamp(foam,0.0,1.0) * 0.75 * uFoam);
        diffuseColor.rgb = col;`
      );
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -0.22;
  mesh.receiveShadow = true;
  return {
    mesh,
    update(env) {
      U.uTime.value = env.t;
      U.uAmp.value = 1 + Math.min(1.2, env.wind / 30) + env.rain * 0.3;
      U.uShallow.value.copy(env.cur.sh).lerp(env.gray, env.ov * 0.35);
      U.uDeep.value.copy(env.cur.dp).lerp(env.gray.clone().multiplyScalar(0.6), env.ov * 0.35);
    },
  };
}

export function build(ctx) {
  const group = new THREE.Group();
  const island = new THREE.Group();
  group.add(island);
  const R = rng(7);

  const ocean = makeOcean();
  group.add(ocean.mesh);

  /* ground */
  const dirt = mat('#8b5b3a'), rock = mat('#6c4a33'), sand = mat('#ecd5a3');
  const top = new THREE.Mesh(shapedCylinder(1, 0.985, 0.5, 96, islandR), [dirt, ctx.grassMat, dirt]);
  top.position.y = GROUND - 0.25;
  island.add(shadows(top));
  const body = new THREE.Mesh(shapedCylinder(0.985, 0.72, 2.2, 96, islandR, 0.18), rock);
  body.position.y = -1.1;
  island.add(shadows(body));
  const beach = new THREE.Mesh(shapedCylinder(1, 1.06, 0.36, 128, beachR), sand);
  beach.position.y = -0.11;
  beach.receiveShadow = true;
  island.add(beach);

  // plateau (lighthouse hill)
  const pl = { x: 3.4, z: -3.6, r: 2.6, h: 0.9 };
  const hill = new THREE.Mesh(shapedCylinder(1, 1.12, pl.h, 32, (a) => pl.r + 0.25 * Math.sin(a * 4 + 1)), [dirt, ctx.grassMat, dirt]);
  hill.position.set(pl.x, GROUND + pl.h / 2 - 0.02, pl.z);
  island.add(shadows(hill));
  const groundY = (x, z) => (Math.hypot(x - pl.x, z - pl.z) < pl.r - 0.2 ? GROUND + pl.h - 0.02 : GROUND);

  for (let i = 0; i < 6; i++) {
    const a = R() * TAU, d = R() * 4.5;
    const x = Math.cos(a) * d - 1, z = Math.sin(a) * d + 1;
    if (Math.hypot(x - pl.x, z - pl.z) < 3.5) continue;
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + R() * 0.8, 1), ctx.grassMat);
    h.scale.set(1, 0.18, 1);
    h.position.set(x, GROUND - 0.05, z);
    h.receiveShadow = true;
    island.add(h);
  }

  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 14), waterMat());
  pond.scale.set(1.3, 1, 0.85);
  pond.position.set(-1.6, GROUND + 0.01, 3.6);
  island.add(pond);

  // path
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.2, 0, -0.4), new THREE.Vector3(-1.2, 0, 0.6), new THREE.Vector3(0.8, 0, 0.2),
    new THREE.Vector3(2.4, 0, 1.6), new THREE.Vector3(4.2, 0, 3.4), new THREE.Vector3(6.2, 0, 5.4),
  ]);
  const N = 46;
  const stone = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 7), mat('#d9c08f'), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const pathPts = [];
  for (let i = 0; i < N; i++) {
    const v = curve.getPoint(i / (N - 1));
    pathPts.push(v.clone());
    m4.compose(new THREE.Vector3(v.x + (R() - 0.5) * 0.12, GROUND + 0.01, v.z + (R() - 0.5) * 0.12), q.setFromAxisAngle(up, R() * 3), one);
    stone.setMatrixAt(i, m4);
  }
  stone.receiveShadow = true;
  island.add(stone);

  const blocked = [{ x: pl.x, z: pl.z, r: pl.r + 0.6 }, { x: -1.6, z: 3.6, r: 1.8 }];
  const freeSpot = (R, minR = 0, maxMargin = 0.9, clear = 0.6) => {
    for (let tries = 0; tries < 60; tries++) {
      const a = R() * TAU;
      const d = Math.sqrt(R()) * (islandR(a) - maxMargin);
      if (d < minR) continue;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (blocked.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) continue;
      if (pathPts.some((p) => Math.hypot(x - p.x, z - p.z) < clear)) continue;
      return { x, z };
    }
    return null;
  };

  /* windmill */
  const wm = new THREE.Group();
  const wood = mat('#7a5638');
  const wmBase = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.92, 2.5, 8), mat('#efe2cc'));
  wmBase.position.y = 1.25;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.0, 8), mat('#b4523a'));
  cap.position.y = 3.0;
  const wmDoor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.65, 0.1), wood);
  wmDoor.position.set(0, 0.33, 0.86);
  const wmWin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.1), ctx.windowMat);
  wmWin.position.set(0, 1.6, 0.74);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8), wood);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 2.55, 0.85);
  const blades = new THREE.Group();
  blades.position.set(0, 2.55, 1.1);
  const sailM = mat('#f4ead6');
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.2, 0.06), wood);
    beam.position.y = 1.1;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.65, 0.03), sailM);
    s.position.set(0.3, 1.3, 0);
    arm.add(beam, s);
    arm.rotation.z = (i * Math.PI) / 2;
    blades.add(arm);
  }
  wm.add(wmBase, cap, wmDoor, wmWin, hub, blades);
  shadows(wm);
  wm.position.set(-3.6, GROUND, -1.6);
  wm.rotation.y = 0.5;
  island.add(wm);
  blocked.push({ x: -3.6, z: -1.6, r: 1.7 });

  /* lighthouse */
  const lh = new THREE.Group();
  const red = mat('#d64b3c'), whiteM = mat('#f4efe6'), dark = mat('#2f3a45');
  const bands = 6, H = 3.6;
  for (let i = 0; i < bands; i++) {
    const r0 = lerp(0.78, 0.5, i / bands), r1 = lerp(0.78, 0.5, (i + 1) / bands);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H / bands, 14), i % 2 ? whiteM : red);
    m.position.y = (H / bands) * (i + 0.5);
    lh.add(m);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.12, 14), dark);
  gallery.position.y = H + 0.06;
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0.2, flatShading: true });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 10), lampMat);
  lamp.position.y = H + 0.42;
  const lhRoof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.55, 10), red);
  lhRoof.position.y = H + 0.98;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), dark);
  ball.position.y = H + 1.3;
  const lhDoor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.6, 0.1), dark);
  lhDoor.position.set(0, 0.3, 0.76);
  lh.add(gallery, lamp, lhRoof, ball, lhDoor);
  shadows(lh);
  const beamGeo = new THREE.ConeGeometry(1.3, 11, 24, 1, true);
  beamGeo.translate(0, -5.5, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#fff0b8') } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.2) * uOpacity; gl_FragColor = vec4(uColor * a, a); }`,
  });
  const beams = new THREE.Group();
  const b1 = new THREE.Mesh(beamGeo, beamMat);
  const b2 = b1.clone(); b2.rotation.y = Math.PI;
  beams.add(b1, b2);
  beams.position.y = H + 0.42;
  lh.add(beams);
  const lampLight = new THREE.PointLight('#ffcf80', 0, 14, 1.6);
  lampLight.position.y = H + 0.42;
  lh.add(lampLight);
  lh.position.set(pl.x, GROUND + pl.h - 0.02, pl.z);
  island.add(lh);

  /* village */
  const spots = [
    { x: -0.6, z: -1.6, ry: 0.2, w: 1.6, d: 1.3, h: 1.1, wall: '#f3e7d3', roof: '#d0653a' },
    { x: 1.4, z: -0.6, ry: -0.5, w: 1.2, d: 1.0, h: 0.9, wall: '#efe0c8', roof: '#c4493a' },
    { x: 1.2, z: 3.0, ry: 0.9, w: 1.3, d: 1.1, h: 1.0, wall: '#f6ecdc', roof: '#de7b3e' },
    { x: -4.4, z: 2.2, ry: -0.3, w: 1.1, d: 0.95, h: 0.85, wall: '#eadcc6', roof: '#b9553c' },
    { x: 4.0, z: 1.0, ry: -1.2, w: 1.0, d: 0.9, h: 0.8, wall: '#f3e7d3', roof: '#d0653a' },
  ];
  const chimneys = [];
  for (const s of spots) {
    const h = makeHouse(ctx, s.w, s.d, s.h, s.wall, s.roof);
    h.position.set(s.x, GROUND, s.z);
    h.rotation.y = s.ry;
    island.add(h);
    blocked.push({ x: s.x, z: s.z, r: Math.max(s.w, s.d) * 0.9 + 0.3 });
    h.updateMatrixWorld();
    chimneys.push(h.localToWorld(h.userData.chimney.clone()));
  }
  const well = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.35, 10), mat('#a8a39a'));
  ring.position.y = 0.17;
  const rf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 4), mat('#b4523a'));
  rf.position.y = 0.95; rf.rotation.y = Math.PI / 4;
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), wood);
  p1.position.set(0.3, 0.5, 0);
  const p2 = p1.clone(); p2.position.x = -0.3;
  well.add(ring, rf, p1, p2);
  shadows(well, true, false);
  well.position.set(0.3, GROUND, 1.2);
  island.add(well);
  blocked.push({ x: 0.3, z: 1.2, r: 0.7 });
  const smoke = new Smoke(group, chimneys);

  /* trees */
  const TR = rng(21);
  const trees = [];
  for (let i = 0; i < 52; i++) {
    const s = freeSpot(TR, 0, 0.8, 0.55);
    if (!s) continue;
    const kind = TR() < 0.35 ? 'pine' : 'leafy';
    const g = makeTree(ctx, TR, kind);
    g.scale.setScalar(0.7 + TR() * 0.55);
    g.position.set(s.x, groundY(s.x, s.z) - 0.02, s.z);
    island.add(g);
    trees.push(g);
    blocked.push({ x: s.x, z: s.z, r: 0.45 });
  }

  /* sheep */
  const SR = rng(33);
  const wool = mat('#f6f3ee'), face = mat('#3a3330');
  const sheep = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), wool);
    b.scale.set(1.35, 1, 1);
    b.position.y = 0.3;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.13), face);
    h.position.set(0.3, 0.36, 0);
    for (const [lx, lz] of [[0.14, 0.09], [0.14, -0.09], [-0.14, 0.09], [-0.14, -0.09]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), face);
      l.position.set(lx, 0.09, lz);
      g.add(l);
    }
    g.add(b, h);
    shadows(g, true, false);
    const s = { x: -5 + SR() * 3, z: 3 + SR() * 2 };
    g.position.set(s.x, GROUND, s.z);
    g.userData = { tx: s.x, tz: s.z, wait: SR() * 4, R: SR };
    island.add(g);
    sheep.push(g);
  }

  /* dock + boat */
  const da = -0.55, rb = beachR(da);
  const dock = new THREE.Group();
  const plank = mat('#a87a52'), post = mat('#6e4b32');
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 4.2), plank);
  deck.position.set(0, 0.22, 0);
  dock.add(deck);
  for (let i = 0; i < 4; i++) {
    for (const sx of [-0.5, 0.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), post);
      p.position.set(sx, -0.18, -1.9 + i * 1.25);
      dock.add(p);
    }
  }
  shadows(dock);
  const dd = rb + 1.4;
  dock.position.set(Math.cos(da) * dd, 0, Math.sin(da) * dd);
  dock.rotation.y = -da + Math.PI / 2;
  group.add(dock);

  const boat = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.4, 0.25); hullShape.lineTo(0.4, 0.25); hullShape.lineTo(0.28, 0); hullShape.lineTo(-0.28, 0); hullShape.lineTo(-0.4, 0.25);
  const hg = new THREE.ExtrudeGeometry(hullShape, { depth: 1.5, bevelEnabled: false });
  hg.translate(0, 0, -0.75);
  const hull = new THREE.Mesh(hg, mat('#3f6e8f'));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), post);
  mast.position.y = 0.85;
  const ss = new THREE.Shape(); ss.moveTo(0, 0); ss.lineTo(0, 1.0); ss.lineTo(0.6, 0); ss.lineTo(0, 0);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(ss), mat('#f7f1e4', { side: THREE.DoubleSide }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0, 0.35, 0.05);
  boat.add(hull, mast, sail);
  shadows(boat, true, false);
  const bd = rb + 2.6;
  boat.position.set(Math.cos(da + 0.22) * bd, -0.2, Math.sin(da + 0.22) * bd);
  boat.rotation.y = -da;
  group.add(boat);

  /* rocks and islets */
  const KR = rng(44);
  const rockM = mat('#8f969c');
  for (let i = 0; i < 16; i++) {
    const a = KR() * TAU, d = beachR(a) + 0.8 + KR() * 3.5;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + KR() * 0.45, 0), rockM);
    m.position.set(Math.cos(a) * d, -0.25 + KR() * 0.1, Math.sin(a) * d);
    m.rotation.set(KR() * 3, KR() * 3, KR() * 3);
    m.scale.y = 0.6;
    m.castShadow = true;
    group.add(m);
  }
  for (const [a, d, s] of [[2.3, 26, 1.4], [3.5, 34, 2.0], [0.9, 40, 1.6], [5.0, 30, 1.1]]) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * s, 1.8 * s, 0.3, 12), sand);
    const gr = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * s, 1.2 * s, 0.4, 10), ctx.grassMat);
    gr.position.y = 0.25;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s, 1.0 * s, 6), ctx.pineMat);
    t.position.set(0.2 * s, 0.9 * s, 0);
    g.add(b, gr, t);
    shadows(g);
    g.position.set(Math.cos(a) * d, -0.1, Math.sin(a) * d);
    group.add(g);
  }

  return {
    group,
    update(env) {
      const { t, dt, night } = env;
      ocean.update(env);

      lampMat.emissiveIntensity = 0.2 + night * 3;
      lampLight.intensity = night * 25;
      beamMat.uniforms.uOpacity.value = night * 0.35 + env.fog * night * 0.15;
      beams.rotation.y = t * 0.9;
      beams.visible = night > 0.02;

      blades.rotation.z -= dt * (0.35 + Math.min(env.wind, 60) / 22);
      smoke.update(env, env.season !== 'summer' || night > 0.3);

      const sway = 0.015 + Math.min(env.wind, 50) / 1600;
      for (const tr of trees) tr.rotation.z = Math.sin(t * 1.3 + tr.userData.phase) * sway;

      for (const sh of sheep) {
        const u = sh.userData;
        const dx = u.tx - sh.position.x, dz = u.tz - sh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          u.wait -= dt;
          if (u.wait < 0) {
            const s = freeSpot(u.R, 0, 1.4, 0);
            if (s && Math.hypot(s.x - sh.position.x, s.z - sh.position.z) < 4) { u.tx = s.x; u.tz = s.z; }
            u.wait = 2 + u.R() * 6;
          }
          sh.position.y = groundY(sh.position.x, sh.position.z);
        } else {
          const sp = 0.35 * dt;
          sh.position.x += (dx / d) * Math.min(sp, d);
          sh.position.z += (dz / d) * Math.min(sp, d);
          const want = Math.atan2(-dz, dx);
          sh.rotation.y += (((want - sh.rotation.y + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 4);
          sh.position.y = groundY(sh.position.x, sh.position.z) + Math.abs(Math.sin(t * 9)) * 0.03;
        }
      }

      boat.position.y = -0.24 + Math.sin(t * 1.2) * 0.06;
      boat.rotation.z = Math.sin(t * 0.9) * 0.05;
      boat.rotation.x = Math.sin(t * 1.1 + 1) * 0.04;
    },
  };
}
