// "AI scene" support: the prompt users give their AI assistant, and a strict checker for the
// scene description it returns. Scene files are plain data (never code), so a bad or hostile
// file can only fail the check, never run anything.

export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'torus'];
export const GROUNDS = ['island', 'plain', 'water', 'none'];
export const ANIMATIONS = ['spin', 'bob', 'sway', 'orbit', 'pulse'];
// Special colour names that follow the world: seasons, snow and night lights.
export const LIVE_COLORS = ['grass', 'leaves', 'pine', 'window'];

const MAX_BYTES = 300 * 1024;
const MAX_MESHES = 2000;
const MAX_DEPTH = 5;
const SPAN = 60; // positions are kept within ±SPAN

export const SCENE_PROMPT = `You are designing a small low-poly 3D scene for "Worldlet", a Chrome new-tab extension. Worldlet draws the scene in the middle of a live sky with real weather, sun, moon and seasons.

Reply with ONE JSON object only, inside a single \`\`\`json code block. No other text. Do not write code; Worldlet only reads this data format:

{
  "worldlet": 1,
  "name": "short scene name",
  "ground": { "type": "island", "color": "grass", "radius": 10 },
  "objects": [ ...objects... ]
}

GROUND
- "type": "island" (grassy island in a sea), "plain" (flat land to the horizon), "water" (open sea) or "none".
- "color": a hex colour like "#d9b97a", or "grass" to follow the seasons. "radius": 4 to 20 (island size).
- The ground surface is at y = 0.5. Units are metres. Keep everything within 12 m of the centre so it fits the view.

OBJECTS (each one is a simple low-poly shape)
- "shape": "box" | "sphere" | "cylinder" | "cone" | "pyramid" | "torus"
- Size: box uses "size": [width, height, depth]. sphere uses "radius". cylinder uses "radius", "height" and optional "radiusTop". cone and pyramid use "radius", "height". torus uses "radius" and "tube".
- "position": [x, y, z] (the shape's centre; y is up). "rotation": [x, y, z] in degrees. "scale": a number or [x, y, z].
- "color": hex like "#c84a3a". Special colours: "grass", "leaves", "pine" change with the seasons and get snowy in winter; "window" glows warm at night.
- "glow": true makes the object light up at night (lamps, lanterns, fires, crystals).
- "animate": { "type": "spin" | "bob" | "sway" | "orbit" | "pulse", "speed": 1, "amount": 1 }. spin turns around y, bob floats up and down, sway rocks in the wind, orbit circles the centre, pulse breathes in size.
- "children": [ ...objects... ] builds one thing from parts (a tree = trunk + cones). Child positions are relative to the parent, and the parent's animation moves the whole group.
- "shape": "group" is an invisible parent that only holds "children".
- "repeat": { "pattern": "ring" | "scatter", "count": 2-60, "radius": metres } copies the object around its position: evenly in a ring, or randomly in a disc. Great for forests, rocks, fences.

STYLE
- Cozy, readable from a distance, flat colours, chunky shapes. 30 to 250 objects in total (repeats count).
- Build recognisable landmarks from several shapes. Leave the area around the camera (positive z, beyond 8 m) open.

SCENE TO BUILD:
[describe your scene here, e.g. "a tiny Moroccan riad courtyard with a fountain, orange trees and lanterns"]`;

class SceneError extends Error {}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Pull the JSON object out of an AI reply that may include ```json fences or chatter.
export function extractJSON(text) {
  if (typeof text !== 'string') throw new SceneError('The scene file is empty.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SceneError('No scene found. Paste the whole reply from your AI assistant, including the part in curly braces { }.');
  body = body.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new SceneError(`The scene file has a typo the checker can't read (${e.message.replace(/^JSON\.parse: /, '')}). Ask your assistant to "return only valid JSON" and paste it again.`);
  }
}

function color(v, path, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') throw new SceneError(`${path} should be a colour like "#c84a3a".`);
  const c = v.trim().toLowerCase();
  if (LIVE_COLORS.includes(c)) return c;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) return c;
  throw new SceneError(`${path} is "${v}". Use a hex colour like "#c84a3a", or one of: ${LIVE_COLORS.join(', ')}.`);
}

function vec3(v, path, fallback, lim = SPAN) {
  if (v == null) return fallback;
  if (isNum(v)) return [clamp(v, -lim, lim), clamp(v, -lim, lim), clamp(v, -lim, lim)];
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) throw new SceneError(`${path} should be three numbers like [1, 0.5, -2].`);
  return v.map((x) => clamp(x, -lim, lim));
}

function size(v, path, fallback, min = 0.02, max = 40) {
  if (v == null) return fallback;
  if (!isNum(v)) throw new SceneError(`${path} should be a number.`);
  return clamp(Math.abs(v), min, max);
}

function normalizeObject(o, path, depth, counter) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new SceneError(`${path} should be an object with a "shape".`);
  if (depth > MAX_DEPTH) throw new SceneError(`${path} is nested too deeply (max ${MAX_DEPTH} levels of "children").`);
  const hasChildren = Array.isArray(o.children) && o.children.length > 0;
  const shape = o.shape == null && hasChildren ? 'group' : String(o.shape || '').toLowerCase();
  if (shape !== 'group' && !SHAPES.includes(shape)) throw new SceneError(`${path}.shape is "${o.shape ?? ''}". Use one of: ${SHAPES.join(', ')}.`);

  const out = {
    shape,
    position: vec3(o.position, `${path}.position`, [0, 0, 0]),
    rotation: vec3(o.rotation, `${path}.rotation`, [0, 0, 0], 3600),
    scale: o.scale == null ? [1, 1, 1] : vec3(o.scale, `${path}.scale`, [1, 1, 1], 20).map((s) => (Math.abs(s) < 0.01 ? 0.01 : s)),
    color: color(o.color, `${path}.color`, '#c9c2b4'),
    glow: o.glow === true,
  };
  if (shape === 'box') {
    const s = o.size == null ? [1, 1, 1] : o.size;
    if (!Array.isArray(s) || s.length !== 3 || !s.every(isNum)) throw new SceneError(`${path}.size should be [width, height, depth].`);
    out.size = s.map((x) => clamp(Math.abs(x), 0.02, 40));
  }
  if (shape === 'sphere') out.radius = size(o.radius, `${path}.radius`, 0.5);
  if (shape === 'cylinder') {
    out.radius = size(o.radius, `${path}.radius`, 0.5);
    out.radiusTop = size(o.radiusTop, `${path}.radiusTop`, out.radius, 0);
    out.height = size(o.height, `${path}.height`, 1);
  }
  if (shape === 'cone' || shape === 'pyramid') {
    out.radius = size(o.radius, `${path}.radius`, 0.5);
    out.height = size(o.height, `${path}.height`, 1);
  }
  if (shape === 'torus') {
    out.radius = size(o.radius, `${path}.radius`, 0.6);
    out.tube = size(o.tube, `${path}.tube`, 0.15, 0.01, 10);
  }
  if (o.animate != null) {
    const a = o.animate;
    const type = typeof a === 'string' ? a : a?.type;
    if (!ANIMATIONS.includes(type)) throw new SceneError(`${path}.animate.type is "${type ?? ''}". Use one of: ${ANIMATIONS.join(', ')}.`);
    out.animate = { type, speed: clamp(isNum(a.speed) ? a.speed : 1, -10, 10), amount: clamp(isNum(a.amount) ? a.amount : 1, 0, 10) };
  }
  let copies = 1;
  if (o.repeat != null) {
    const r = o.repeat;
    const pattern = r.pattern === 'ring' ? 'ring' : 'scatter';
    const count = Math.round(clamp(isNum(r.count) ? r.count : 1, 1, 60));
    out.repeat = { pattern, count, radius: clamp(isNum(r.radius) ? Math.abs(r.radius) : 3, 0, 30) };
    copies = count;
  }
  counter.n += copies * (shape === 'group' ? 0 : 1);
  if (hasChildren) {
    const before = counter.n;
    out.children = o.children.map((c, i) => normalizeObject(c, `${path}.children[${i}]`, depth + 1, counter));
    counter.n = before + (counter.n - before) * copies;
  }
  if (counter.n > MAX_MESHES) throw new SceneError(`The scene has more than ${MAX_MESHES} shapes once repeats are counted. Ask your assistant to make it simpler.`);
  return out;
}

// Returns a normalized scene, or throws an Error whose message is safe to show to the user.
export function checkScene(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  if (raw.length > MAX_BYTES) throw new SceneError('That scene file is over 300 KB. Ask your assistant for fewer objects.');
  const data = typeof input === 'string' ? extractJSON(input) : input;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SceneError('The scene should be one JSON object starting with {.');
  if (!Array.isArray(data.objects) || data.objects.length === 0) throw new SceneError('The scene has no "objects" list. Ask your assistant to follow the Worldlet format.');

  const g = data.ground || {};
  const groundType = g.type == null ? 'island' : String(g.type).toLowerCase();
  if (!GROUNDS.includes(groundType)) throw new SceneError(`ground.type is "${g.type}". Use one of: ${GROUNDS.join(', ')}.`);
  const counter = { n: 0 };
  const objects = data.objects.map((o, i) => normalizeObject(o, `objects[${i}]`, 1, counter));
  return {
    worldlet: 1,
    name: typeof data.name === 'string' ? data.name.slice(0, 60) : 'My scene',
    ground: {
      type: groundType,
      color: color(g.color, 'ground.color', groundType === 'plain' ? '#c9b48a' : 'grass'),
      radius: clamp(isNum(g.radius) ? g.radius : 10, 4, 20),
    },
    objects,
    shapeCount: counter.n,
  };
}
