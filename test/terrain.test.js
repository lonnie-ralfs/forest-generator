import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain } from '../src/terrain.js';

test('mountains have substantial relief and erosion cuts reproducible channels', () => {
  const config = { seed: 7421, size: 280, relief: 65 };
  const raw = makeTerrain({ ...config, erosion: 0 });
  const eroded = makeTerrain({ ...config, erosion: 1 });
  const repeat = makeTerrain({ ...config, erosion: 1 });
  let min = Infinity, max = -Infinity, cutCount = 0;
  for (let x = -135; x <= 135; x += 5) for (let z = -135; z <= 135; z += 5) {
    const h = eroded.height(x, z);
    assert.ok(Number.isFinite(h));
    assert.equal(h, repeat.height(x, z));
    assert.equal(raw.erosionAt(x, z), 0);
    min = Math.min(min, h); max = Math.max(max, h);
    if (raw.height(x, z) - h > 0.5) cutCount++;
  }
  assert.ok(max - min > config.relief, 'mountain relief should exceed the old plateau');
  assert.ok(cutCount > 100, 'erosion should change a meaningful part of the terrain');
});
