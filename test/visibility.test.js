import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateInstanceBuffers } from '../src/visibility.js';

function group(tree) {
  const plants = [10, 90, 200].map(x => ({ x, y: 0, z: 0, scale: 1 }));
  const matrices = new Float32Array(48);
  plants.forEach((p, i) => matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p.x, p.y, p.z, 1], i * 16));
  return { tree, plants, matrices, nearBuffer: new Float32Array(48), farBuffer: new Float32Array(48), topBuffer: new Float32Array(48), nearFade: new Float32Array(6), farFade: new Float32Array(6), topFade: new Float32Array(6) };
}
const distances = { treeBillboardDistance: 90, foliageCullDistance: 90 };
test('trees retain their roots and scale outside the crossfade band', () => {
  const g = group(true);
  assert.deepEqual(updateInstanceBuffers(g, { x: 0, y: 0, z: 0 }, distances), { nearCount: 2, farCount: 1, topCount: 0 });
  assert.equal(g.nearBuffer[28], 90);
  assert.deepEqual([...g.farBuffer.slice(12, 15)], [200, 0, 0]);
  assert.ok(Math.abs(g.farBuffer[8] + 1) < 1e-6); // Card normal faces the camera along -X.
  assert.deepEqual(updateInstanceBuffers(g, { x: 200, y: 0, z: 0 }, distances), { nearCount: 1, farCount: 2, topCount: 0 });
  assert.equal(g.nearBuffer[12], 200);
});
test('small foliage culls by full camera distance and returns when approached', () => {
  const g = group(false);
  assert.deepEqual(updateInstanceBuffers(g, { x: 0, y: 100, z: 0 }, distances), { nearCount: 0, farCount: 0, topCount: 0 });
  assert.deepEqual(updateInstanceBuffers(g, { x: 0, y: 0, z: 0 }, distances), { nearCount: 1, farCount: 0, topCount: 0 });
  assert.deepEqual(updateInstanceBuffers(g, { x: 200, y: 0, z: 0 }, distances), { nearCount: 1, farCount: 0, topCount: 0 });
  assert.equal(g.nearBuffer[12], 200);
});
test('tree geometry and billboards have complementary weights throughout the fade', () => {
  const g = group(true);
  // The tree rooted at x=90 is 99 m away: halfway through the 90–108 m band.
  updateInstanceBuffers(g, { x: -9, y: 0, z: 0 }, distances);
  assert.equal(g.nearFade[3], 0.5);
  assert.equal(g.farFade[0], 0.5);
  assert.equal(g.nearBuffer[28], g.farBuffer[12]);
  for (const x of [-1, -5, -9, -13, -17]) {
    updateInstanceBuffers(g, { x, y: 0, z: 0 }, distances);
    assert.ok(Math.abs(g.nearFade[3] - g.farFade[0]) < 1e-6);
  }
});
test('foliage smoothly fades before the culling boundary and recovers on approach', () => {
  const g = group(false);
  updateInstanceBuffers(g, { x: 9, y: 0, z: 0 }, distances);
  assert.equal(g.nearFade[3], 0.5);
  updateInstanceBuffers(g, { x: 18, y: 0, z: 0 }, distances);
  assert.equal(g.nearFade[3], 1);
  assert.equal(updateInstanceBuffers(g, { x: 0, y: 0, z: 0 }, distances).nearCount, 1);
});
test('an unavailable capture retains full tree geometry', () => {
  assert.deepEqual(updateInstanceBuffers(group(true), { x: 0, y: 1000, z: 0 }, distances, false), { nearCount: 3, farCount: 0, topCount: 0 });
  assert.deepEqual(updateInstanceBuffers(group(false), { x: 0, y: 1000, z: 0 }, distances, false), { nearCount: 0, farCount: 0, topCount: 0 });
});
test('overhead distant trees use the top capture and preserve their world transforms', () => {
  const g = group(true);
  assert.deepEqual(updateInstanceBuffers(g, { x: 0, y: 1000, z: 0 }, distances), { nearCount: 0, farCount: 0, topCount: 3 });
  assert.deepEqual(g.topBuffer, g.matrices);
  assert.deepEqual([...g.topFade], [0, 1, 0, 1, 0, 1]);
});
test('side/top/geometry fades partition coverage without doubling or leaving holes', () => {
  const g = group(true);
  g.plants = [g.plants[0]];
  const angle = Math.PI * 50 / 180;
  const eye = { x: 10 + 99 * Math.cos(angle), y: 99 * Math.sin(angle), z: 0 };
  assert.deepEqual(updateInstanceBuffers(g, eye, distances), { nearCount: 1, farCount: 1, topCount: 1 });
  assert.equal(g.nearFade[0], 0);
  assert.equal(g.nearFade[1], g.farFade[0]);
  assert.equal(g.farFade[1], g.topFade[0]);
  assert.equal(g.topFade[1], 1);
  assert.ok(Math.abs(g.nearFade[1] - 0.5) < 1e-6);
  assert.ok(Math.abs(g.farFade[1] - 0.75) < 1e-6);
});

