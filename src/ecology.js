import { makeTerrain, noise } from './terrain.js';
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function random(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function makeForest(config) {
  const { seed, size, density, slopeLimit, relief, roots } = config;
  const rng = random(seed);
  const { height, erosionAt } = makeTerrain(config);
  const slope = (x, z) => Math.atan(Math.hypot((height(x + 0.5, z) - height(x - 0.5, z)), (height(x, z + 0.5) - height(x, z - 0.5)))) * 180 / Math.PI;
  const habitat = (x, z) => noise(x / 77 + 12, z / 77 + 8, seed + 9) - 0.30 + 0.14 * Math.cos(z / 34) - 0.19 * Math.exp(-(((x + Math.sin(z / 43) * 24) / 13) ** 2));
  const suitable = (x, z) => Math.abs(x) < size / 2 - 4 && Math.abs(z) < size / 2 - 4 && habitat(x, z) > 0 && slope(x, z) <= slopeLimit;
  const trees = [], cells = new Map(), cellSize = 12;
  const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  const step = 4.2;
  for (let x = -size / 2 + step; x < size / 2 - step; x += step) for (let z = -size / 2 + step; z < size / 2 - step; z += step) {
    const px = x + (rng() - 0.5) * step * 0.8, pz = z + (rng() - 0.5) * step * 0.8;
    if (rng() > density || !suitable(px, pz)) continue;
    let edge = false;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (!suitable(px + Math.cos(a) * 11, pz + Math.sin(a) * 11)) { edge = true; break; } }
    const y = height(px, pz), altitude = clamp(y / Math.max(1, relief * 1.3));
    const scale = (0.85 + rng() * 0.35) * (1 - altitude * 0.52);
    const t = { x: px, z: pz, y, scale, rotation: rng() * Math.PI * 2, edge, slope: slope(px, pz), mound: roots * scale };
    trees.push(t); const k = key(px, pz); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t);
  }
  const nearby = (x, z, fn) => { const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const t of cells.get(`${cx + a},${cz + b}`) || []) fn(t); };
  const rootHeight = (x, z) => { let h = 0; nearby(x, z, t => { const d = Math.hypot(x - t.x, z - t.z), radius = 2.8 * t.scale; if (d < radius) h += t.mound * (1 - d / radius) ** 2; }); return h; };
  const shade = (x, z) => { let s = 0; nearby(x, z, t => { const d = Math.hypot(x - t.x, z - t.z), r = (t.edge ? 5.5 : 4.6) * t.scale; s += clamp(1 - d / r) * 1.65; }); return clamp(s); };
  const ground = (x, z) => height(x, z) + rootHeight(x, z);
  for (const t of trees) t.y = ground(t.x, t.z) - 0.08;
  const foliage = [];
  for (let i = 0; i < size * size * 0.19; i++) { const x = (rng() - 0.5) * (size - 4), z = (rng() - 0.5) * (size - 4); if (slope(x, z) > slopeLimit) continue; const cover = shade(x, z); const kind = cover > 0.3 ? (rng() < 0.72 ? 'fern' : 'bush') : 'grass'; if (kind === 'grass' && rng() > 0.58) continue; foliage.push({ x, z, y: ground(x, z), rotation: rng() * Math.PI * 2, scale: 0.6 + rng() * 0.7, kind, shade: cover }); }
  return { trees, foliage, height, ground, shade, slope, rootHeight, suitable, erosionAt };
}
