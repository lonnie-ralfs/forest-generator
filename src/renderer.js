import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { createTreeBillboards } from './treeBillboards.js';
import { DEFAULT_DISTANCES, updateInstanceBuffers } from './visibility.js';
import { BillboardAO, configureBillboardAO } from './billboardAO.js';
import { InstanceFade } from './instanceFade.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';

export function createRenderer(canvas) {
  const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine); scene.clearColor = Color4.FromHexString('#b8c8bcff');
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.00055; scene.fogColor = Color3.FromHexString('#b8c8bc');
  scene.skipPointerMovePicking = true;
  const camera = new ArcRotateCamera('camera', -Math.PI * 0.62, 0.93, 300, new Vector3(0, 23, 0), scene);
  camera.attachControl(canvas, true); camera.lowerRadiusLimit = 12; camera.upperRadiusLimit = 1100; camera.upperBetaLimit = 1.48; camera.wheelPrecision = 5; camera.panningSensibility = 35; camera.minZ = 0.5; camera.maxZ = 1800;
  const hemi = new HemisphericLight('sky', new Vector3(0, 1, 0), scene); hemi.intensity = 0.65; hemi.groundColor = new Color3(0.22, 0.27, 0.19);
  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.5), scene); sun.intensity = 1.6; sun.diffuse = new Color3(1, 0.9, 0.72);
  // Match the glTF material pipeline, including linear-space lighting and fog.
  const material = (name, color) => { const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(color).toLinearSpace(); m.metallic = 0; m.roughness = 1; return m; };
  const bark = material('warm bark', '#64513b'), needles = material('pine needles', '#355b43'), tips = material('new growth', '#486b47'), grass = material('meadow', '#7e8b4b'), fern = material('ferns', '#4f7545');
  const prototypes = new Map(), imported = new Map(); let batches = [], groundMesh;
  const fadingMaterials = new WeakSet();
  function enableInstanceFade(material) {
    if (!material || fadingMaterials.has(material)) return;
    fadingMaterials.add(material);
    if (material.subMaterials) material.subMaterials.forEach(enableInstanceFade);
    else new InstanceFade(material, () => Boolean(aoPipeline));
  }
  let instanceGroups = [], shadowBatches = [], visibilityDirty = true;
  const distances = { ...DEFAULT_DISTANCES }, previousCamera = new Vector3(Infinity, Infinity, Infinity);
  let previousBillboards = '';
  const billboards = new Map();
  function ensureBillboards(kind) {
    if (!billboards.has(kind)) billboards.set(kind, createTreeBillboards(scene,
      imported.get(kind)?.meshes || prototypes.get(kind), kind,
      material => new BillboardAO(material, () => ({ enabled: Boolean(aoPipeline), distance: distances.treeBillboardDistance }))));
    return billboards.get(kind);
  }
  function setDistances(options = {}) {
    for (const key of Object.keys(DEFAULT_DISTANCES)) {
      if (Number.isFinite(options[key]) && options[key] > 0) distances[key] = options[key];
    }
    visibilityDirty = true;
  }
  function updateVisibility() {
    const readyState = [...billboards.values()].map(b => b.ready).join(',');
    const eye = camera.globalPosition;
    if (!visibilityDirty && previousCamera.equalsWithEpsilon(eye, 0.001) && previousBillboards === readyState) return;
    previousCamera.copyFrom(eye); previousBillboards = readyState; visibilityDirty = false;
    const upload = (meshes, count) => {
      for (const mesh of meshes) {
        mesh.setEnabled(count > 0);
        mesh.thinInstanceCount = count;
        if (count) { mesh.thinInstanceBufferUpdated('matrix'); mesh.thinInstanceBufferUpdated('instanceFade'); }
      }
    };
    for (const group of instanceGroups) {
      const { nearCount, farCount, topCount } = updateInstanceBuffers(group, eye, distances, billboards.get(group.kind)?.ready ?? false);
      upload(group.nearMeshes, nearCount);
      upload(group.farMeshes, farCount);
      upload(group.topMeshes, topCount);
    }
  }
  scene.onBeforeRenderObservable.add(updateVisibility);
  let shadowGenerator, aoPipeline, worldConfig, shadowCasters = [];
  const lighting = { sunIntensity: 1.6, shadows: true, ao: true, aoStrength: 1.2, shadowResolution: 2048, haze: 0.35, hazeColor: '#b8c8bc' };
  const aoSupported = engine.webGLVersion > 1 && engine.getCaps().drawBuffersExtension;
  configureBillboardAO('forest-ao');
  function refreshShadows() {
    if (!shadowGenerator || !worldConfig) return;
    sun.position = new Vector3(0, worldConfig.relief * 0.6, 0)
      .subtract(sun.direction.normalizeToNew().scale(worldConfig.size * 1.5 + worldConfig.relief * 2));
    sun.autoCalcShadowZBounds = true;
    sun.autoUpdateExtends = true;
    const map = shadowGenerator.getShadowMap();
    map.renderList = shadowCasters;
    // The forest and sun are static: render once, invalidate after a rebuild/import.
    map.refreshRate = 0;
    map.resetRefreshCounter();
  }
  function setLighting(options = {}) {
    Object.assign(lighting, options);
    if (sun.intensity !== lighting.sunIntensity) {
      sun.intensity = lighting.sunIntensity;
      // Distant trees bake the scene lights into their cached captures.
      for (const billboard of billboards.values()) billboard.refresh();
    }
    scene.fogColor = Color3.FromHexString(lighting.hazeColor);
    scene.clearColor = Color4.FromHexString(`${lighting.hazeColor}ff`);
    // Keep comparable visibility when the world and overview distance grow.
    scene.fogDensity = lighting.haze * 0.00155 * 280 / (worldConfig?.size || 280);
    scene.fogMode = lighting.haze > 0 ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    if (!lighting.shadows || (shadowGenerator && shadowGenerator.getShadowMap().getSize().width !== lighting.shadowResolution)) {
      shadowGenerator?.dispose(); shadowGenerator = undefined;
    }
    if (lighting.shadows && !shadowGenerator) {
      shadowGenerator = new ShadowGenerator(lighting.shadowResolution, sun);
      shadowGenerator.usePercentageCloserFiltering = engine.webGLVersion > 1;
      shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      shadowGenerator.bias = 0.0003;
      shadowGenerator.normalBias = 0.12;
      shadowGenerator.setDarkness(0.12);
      refreshShadows();
    }
    if ((!lighting.ao || !aoSupported) && aoPipeline) { aoPipeline.dispose(true); scene.disablePrePassRenderer(); aoPipeline = undefined; }
    if (lighting.ao && aoSupported && !aoPipeline) {
      // Use the material prepass: depth/normals now share the exact alpha-cutout
      // and instance-dither discard used by the color pass, including LOD fades.
      aoPipeline = new SSAO2RenderingPipeline('forest-ao', scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera], false);
      aoPipeline.samples = 16;
      aoPipeline.radius = 2.5;
      aoPipeline.base = 0.15;
      aoPipeline.maxZ = camera.maxZ;
      aoPipeline.bilateralSamples = 8;
      aoPipeline.bilateralSoften = 0.5;
      aoPipeline.textureSamples = 1;
    }
    if (aoPipeline) aoPipeline.totalStrength = lighting.aoStrength;
  }
  const finish = (name, pieces) => { const merged = Mesh.MergeMeshes(pieces, true, true, undefined, false, true); merged.name = name; merged.setEnabled(false); merged.isPickable = false; prototypes.set(name, [merged]); };
  for (const edge of [true, false]) {
    const pieces = []; const trunk = MeshBuilder.CreateCylinder('trunk', { height: 12, diameterBottom: 0.65, diameterTop: 0.12, tessellation: 6 }, scene); trunk.position.y = 6; trunk.material = bark; pieces.push(trunk);
    for (let i = 0; i < (edge ? 6 : 3); i++) { const y = edge ? 3 + i * 1.55 : 8 + i * 1.5; const crown = MeshBuilder.CreateCylinder('crown', { height: 3.8, diameterBottom: (13.5 - y) * (edge ? 0.65 : 0.85), diameterTop: 0, tessellation: 7 }, scene); crown.position.y = y; crown.rotation.y = i * 0.65; crown.material = i % 2 ? needles : tips; pieces.push(crown); }
    if (!edge) for (let i = 0; i < 9; i++) { const branch = MeshBuilder.CreateCylinder('dead branch', { height: 1.5, diameterBottom: 0.12, diameterTop: 0.025, tessellation: 4 }, scene); const a = i * 2.4; branch.position.set(Math.cos(a) * 0.56, 3 + i * 0.48, Math.sin(a) * 0.56); branch.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); branch.material = bark; pieces.push(branch); }
    finish(edge ? 'edge' : 'core', pieces);
  }
  for (const kind of ['grass', 'fern', 'bush']) {
    const pieces = [];
    if (kind === 'bush') { const m = MeshBuilder.CreateIcoSphere('bush', { radius: 0.7, subdivisions: 1 }, scene); m.position.y = 0.55; m.scaling.y = 0.8; m.material = needles; pieces.push(m); }
    else for (let i = 0; i < (kind === 'fern' ? 5 : 3); i++) { const m = MeshBuilder.CreateCylinder(kind, { height: kind === 'fern' ? 1.2 : 0.65, diameterBottom: kind === 'fern' ? 0.36 : 0.12, diameterTop: 0, tessellation: 3 }, scene); const a = i * 2.4; m.position.set(Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2); m.rotation.set(Math.sin(a) * 0.8, a, Math.cos(a) * 0.8); m.material = kind === 'fern' ? fern : grass; pieces.push(m); }
    finish(kind, pieces);
  }
  const soil = material('forest floor', '#ffffff'); soil.backFaceCulling = false;
  function terrain(data, config, mode) {
    const n = Math.min(400, Math.ceil(config.size / 1.1)), positions = [], indices = [], colors = [], normals = [];
    const green = Color3.FromHexString('#879269'), litter = Color3.FromHexString('#635b40'), rock = Color3.FromHexString('#939487');
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
      const px = (x / n - 0.5) * config.size, pz = (z / n - 0.5) * config.size;
      const h = data.ground(px, pz), s = data.slope(px, pz), shade = data.shade(px, pz);
      positions.push(px, h, pz);
      let c = Color3.Lerp(green, litter, shade);
      const exposed = Math.min(1, Math.max(0, (s - 24) / 18, (h / config.relief - 0.85) * 1.3));
      c = Color3.Lerp(c, rock, exposed);
      // Darker mineral soil makes drainage cuts legible without extra textures.
      c = c.scale(1 - data.erosionAt(px, pz) * 0.25);
      if (mode === 'slope') c = s > config.slopeLimit ? new Color3(0.8, 0.32, 0.2) : new Color3(0.3, 0.55, 0.4);
      if (mode === 'shade') c = Color3.Lerp(new Color3(0.85, 0.8, 0.51), new Color3(0.15, 0.34, 0.37), shade);
      c = c.toLinearSpace();
      colors.push(c.r, c.g, c.b, 1);
    }
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { const a = z * (n + 1) + x; indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
    VertexData.ComputeNormals(positions, indices, normals); const v = new VertexData(); Object.assign(v, { positions, indices, normals, colors }); groundMesh?.dispose(); groundMesh = new Mesh('terrain', scene); v.applyToMesh(groundMesh); groundMesh.material = soil; groundMesh.isPickable = false; groundMesh.freezeWorldMatrix();
  }
  function rebuild(data, config, mode = 'natural') {
    [...batches, ...shadowBatches].forEach(m => m.dispose()); batches = []; shadowBatches = []; instanceGroups = []; terrain(data, config, mode);
    worldConfig = config;
    setLighting();
    groundMesh.receiveShadows = true;
    shadowCasters = [groundMesh];
    const groups = new Map();
    const add = (t, kind) => { const k = `${kind}:${Math.floor(t.x / 48)}:${Math.floor(t.z / 48)}`; if (!groups.has(k)) groups.set(k, { kind, matrices: [], plants: [] }); const matrix = Matrix.Compose(new Vector3(t.scale, t.scale, t.scale), Quaternion.RotationAxis(Vector3.Up(), t.rotation), new Vector3(t.x, t.y, t.z)); groups.get(k).matrices.push(...matrix.asArray()); groups.get(k).plants.push(t); };
    data.trees.forEach(t => add(t, t.edge ? 'edge' : 'core')); if (config.foliage) data.foliage.forEach(t => add(t, t.kind));
    for (const group of groups.values()) {
      const { kind } = group;
      group.tree = kind === 'edge' || kind === 'core';
      group.matrices = new Float32Array(group.matrices);
      group.nearBuffer = group.matrices.slice();
      group.nearFade = new Float32Array(group.plants.length * 2);
      group.farFade = new Float32Array(group.plants.length * 2);
      group.topFade = new Float32Array(group.plants.length * 2);
      for (let i = 1; i < group.nearFade.length; i += 2) group.nearFade[i] = group.farFade[i] = group.topFade[i] = 1;
      group.nearMeshes = []; group.farMeshes = []; group.topMeshes = [];
      const cards = group.tree ? ensureBillboards(kind) : null;
      const cloneBatch = (source, buffer, dynamic, shadowOnly = false, fadeBuffer = group.nearFade) => {
        const mesh = source.clone(`${kind}-${shadowOnly ? 'shadow' : 'chunk'}`, null, true);
        mesh.makeGeometryUnique(); mesh.setEnabled(true); mesh.isVisible = true; mesh.isPickable = false;
        mesh.thinInstanceSetBuffer('matrix', buffer, 16, !dynamic);
        if (!shadowOnly) {
          mesh.thinInstanceSetBuffer('instanceFade', fadeBuffer, 2, false);
          enableInstanceFade(mesh.material);
        }
        mesh.thinInstanceRefreshBoundingInfo(); mesh.freezeWorldMatrix(); mesh.receiveShadows = !shadowOnly;
        if (shadowOnly) { mesh.layerMask = 0; shadowBatches.push(mesh); shadowCasters.push(mesh); }
        else batches.push(mesh);
        return mesh;
      };
      for (const source of imported.get(kind)?.meshes || prototypes.get(kind)) {
        group.nearMeshes.push(cloneBatch(source, group.nearBuffer, true));
        // Static, camera-hidden casters keep cached shadows stable across distance changes.
        if (group.tree || kind === 'bush') cloneBatch(source, group.matrices, false, true);
      }
      if (group.tree) {
        group.farBuffer = group.matrices.slice();
        group.topBuffer = group.matrices.slice();
        for (const [source, buffer, fade, meshes] of [
          [cards.side, group.farBuffer, group.farFade, group.farMeshes],
          [cards.top, group.topBuffer, group.topFade, group.topMeshes],
        ]) {
          const mesh = cloneBatch(source, buffer, true, false, fade);
          const bounds = mesh.getBoundingInfo();
          const padding = new Vector3(cards.padding, 0, cards.padding);
          bounds.reConstruct(bounds.minimum.subtract(padding), bounds.maximum.add(padding));
          meshes.push(mesh);
        }
      }
      instanceGroups.push(group);
    }
    visibilityDirty = true;
    refreshShadows();
    return batches.length;
  }
  async function loadModel(file, kind) {
    await import('@babylonjs/loaders/glTF');
    const container = await SceneLoader.LoadAssetContainerAsync('', file, scene, undefined, '.glb');
    try {
      const meshes = container.meshes.filter(m => m.getTotalVertices() > 0);
      if (!meshes.length || container.skeletons.length || meshes.some(m => m.morphTargetManager)) throw new Error('Use a static GLB with mesh geometry (no skinning or morph targets).');
      let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
      meshes.forEach(m => { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; min = Vector3.Minimize(min, b.minimumWorld); max = Vector3.Maximize(max, b.maximumWorld); });
      const height = max.y - min.y; if (height < 0.001) throw new Error('The model must have a nonzero vertical height.');
      const normalize = Matrix.Translation(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2).multiply(Matrix.Scaling(12 / height, 12 / height, 12 / height));
      const worlds = meshes.map(m => m.computeWorldMatrix(true).clone());
      meshes.forEach((m, i) => { m.makeGeometryUnique(); m.bakeTransformIntoVertices(worlds[i].multiply(normalize)); m.parent = null; m.position.setAll(0); m.rotation.setAll(0); m.rotationQuaternion = Quaternion.Identity(); m.scaling.setAll(1); m.setEnabled(false); });
      imported.get(kind)?.container.dispose(); imported.set(kind, { container, meshes });
      billboards.get(kind)?.dispose(); billboards.delete(kind);
    } catch (error) { container.dispose(); throw error; }
  }
  setLighting();
  engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
  return { engine, scene, camera, rebuild, loadModel, setLighting, setDistances, aoSupported, home(size, relief) { camera.setTarget(new Vector3(0, relief * 0.55, 0)); camera.alpha = -Math.PI * 0.62; camera.beta = 0.93; camera.radius = size * 1.55; }, top() { camera.beta = 0.05; }, get batches() { return batches.length; } };
}
