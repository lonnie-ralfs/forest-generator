export const DEFAULT_DISTANCES = { treeBillboardDistance: 180, foliageCullDistance: 90 };

// Compact each chunk's instances so culled geometry is not submitted to the GPU.
export function updateInstanceBuffers(group, camera, distances, useBillboards = true) {
  let nearCount = 0, farCount = 0, topCount = 0;
  const limit = group.tree ? distances.treeBillboardDistance : distances.foliageCullDistance;
  const width = Math.min(group.tree ? 30 : 20, limit * 0.2);
  const start = group.tree ? limit : limit - width;
  for (let i = 0; i < group.plants.length; i++) {
    const plant = group.plants[i];
    const dx = camera.x - plant.x, dy = camera.y - plant.y, dz = camera.z - plant.z;
    const distance = Math.hypot(dx, dy, dz);
    const progress = Math.max(0, Math.min(1, (distance - start) / width));
    const farWeight = group.tree && !useBillboards ? 0 : progress * progress * (3 - 2 * progress);
    if (farWeight < 1) {
      group.nearFade.set([0, 1 - farWeight], nearCount * 2);
      group.nearBuffer.set(group.matrices.subarray(i * 16, i * 16 + 16), nearCount++ * 16);
    }
    if (group.tree && farWeight > 0) {
      // Blend side and top projections over 35–65 degrees of elevation.
      const angle = Math.atan2(Math.max(0, dy), Math.hypot(dx, dz));
      const elevation = Math.max(0, Math.min(1, (angle - Math.PI * 35 / 180) / (Math.PI / 6)));
      const topWeight = elevation * elevation * (3 - 2 * elevation);
      const split = 1 - farWeight * topWeight;
      if (topWeight < 1) {
        group.farFade.set([1 - farWeight, split], farCount * 2);
        const offset = farCount++ * 16, yaw = Math.atan2(dx, dz);
        const c = Math.cos(yaw) * plant.scale, s = Math.sin(yaw) * plant.scale;
        group.farBuffer.set([c, 0, -s, 0, 0, plant.scale, 0, 0, s, 0, c, 0, plant.x, plant.y, plant.z, 1], offset);
      }
      if (topWeight > 0) {
        group.topFade.set([split, 1], topCount * 2);
        group.topBuffer.set(group.matrices.subarray(i * 16, i * 16 + 16), topCount++ * 16);
      }
    }
  }
  return { nearCount, farCount, topCount };
}
