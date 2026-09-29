const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
function hash(x, z, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1274126177);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
export function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

// Build once per seed. Rendering, slope rejection and roots sample this same field.
export function makeTerrain({ seed, size, relief, erosion = 0.65 }) {
  const n = Math.min(400, Math.ceil(size / 1.1)), width = n + 1, step = size / n;
  const heights = new Float32Array(width * width), wear = new Float32Array(heights.length);
  const peaks = [
    [-0.20, 0.12, 0.23, 0.30, 1.45],
    [0.19, 0.23, 0.21, 0.23, 1.75],
    [0.28, -0.22, 0.22, 0.25, 1.18],
  ];
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const px = x / n - 0.5, pz = z / n - 0.5;
    const wx = px + (noise(px * 4 + 11, pz * 4, seed) - 0.5) * 0.11;
    const wz = pz + (noise(px * 4, pz * 4 + 17, seed + 1) - 0.5) * 0.11;
    let mountain = 0;
    for (const [cx, cz, rx, rz, amplitude] of peaks) {
      const d = Math.hypot((wx - cx) / rx, (wz - cz) / rz);
      mountain += amplitude * Math.exp(-d * d * 1.65);
    }
    const ridge = 1 - Math.abs(2 * noise(wx * 13 + 7, wz * 13, seed + 3) - 1);
    const detail = noise(wx * 35, wz * 35, seed + 5) - 0.5;
    heights[z * width + x] = relief * (0.1 + mountain * (0.72 + ridge * 0.28) + detail * 0.045 * Math.min(1, mountain) + noise(px * 6, pz * 6, seed + 7) * 0.10);
  }

  const strength = clamp(erosion);
  if (strength > 0) {
    // Route rainfall downhill in elevation order. Converging paths cut deeper gullies.
    const flow = new Float32Array(heights.length).fill(1);
    const downstream = new Int32Array(heights.length).fill(-1);
    const gradient = new Float32Array(heights.length);
    for (let z = 1; z < n; z++) for (let x = 1; x < n; x++) {
      const i = z * width + x;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const j = i + dz * width + dx;
        const g = (heights[i] - heights[j]) / (step * Math.hypot(dx, dz));
        if (g > gradient[i]) { gradient[i] = g; downstream[i] = j; }
      }
    }
    const order = Array.from(heights.keys()).sort((a, b) => heights[b] - heights[a]);
    for (const i of order) if (downstream[i] >= 0) flow[downstream[i]] += flow[i];
    const cuts = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
      cuts[i] = strength * relief * 0.12 * clamp(Math.log1p(flow[i]) / 7) * clamp(gradient[i] / 0.65);
    }
    // Widen channels to keep cuts readable at the terrain mesh resolution.
    for (let z = 1; z < n; z++) for (let x = 1; x < n; x++) {
      const i = z * width + x;
      const cut = (cuts[i] * 4 + cuts[i - 1] + cuts[i + 1] + cuts[i - width] + cuts[i + width]) / 8;
      heights[i] -= cut; wear[i] = cut;
    }
    // Thermal weathering moves loose material onto adjacent lower slopes.
    const delta = new Float32Array(heights.length);
    for (let pass = 0; pass < 12; pass++) {
      delta.fill(0);
      for (let z = 1; z < n; z++) for (let x = 1; x < n; x++) {
        const i = z * width + x;
        let target = i;
        for (const j of [i - 1, i + 1, i - width, i + width]) if (heights[j] < heights[target]) target = j;
        const transfer = Math.max(0, heights[i] - heights[target] - step * 0.8) * 0.16 * strength;
        delta[i] -= transfer; delta[target] += transfer;
      }
      for (let i = 0; i < heights.length; i++) heights[i] += delta[i];
    }
  }
  function sample(field, x, z) {
    const gx = clamp((x / size + 0.5) * n, 0, n), gz = clamp((z / size + 0.5) * n, 0, n);
    const ix = Math.min(n - 1, Math.floor(gx)), iz = Math.min(n - 1, Math.floor(gz));
    const u = gx - ix, v = gz - iz, i = iz * width + ix;
    return (field[i] * (1 - u) + field[i + 1] * u) * (1 - v) + (field[i + width] * (1 - u) + field[i + width + 1] * u) * v;
  }
  return { height: (x, z) => sample(heights, x, z), erosionAt: (x, z) => clamp(sample(wear, x, z) / Math.max(1, relief * 0.07)) };
}
