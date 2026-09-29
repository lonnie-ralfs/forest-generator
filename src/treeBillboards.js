import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';

// Capture each normalized model through the game's lights and materials. Keep
// linear color so the billboard receives fog and display processing exactly once.
export function createTreeBillboards(scene, sources, kind, configureMaterial) {
  const ownedMaterials = [];
  const cloneMaterial = source => {
    const material = source.clone(`${kind}-capture-${source.name}`);
    ownedMaterials.push(material);
    if (source.subMaterials) material.subMaterials = source.subMaterials.map(m => m && cloneMaterial(m));
    else {
      material.fogEnabled = false;
      material.imageProcessingConfiguration = new ImageProcessingConfiguration();
      material.imageProcessingConfiguration.applyByPostProcess = true;
    }
    return material;
  };
  const models = sources.map(source => {
    const mesh = source.clone(`${kind}-capture`, null, true);
    mesh.material = cloneMaterial(source.material);
    mesh.setEnabled(true); mesh.isVisible = true; mesh.layerMask = 0;
    mesh.isPickable = false; mesh.receiveShadows = false;
    mesh.computeWorldMatrix(true);
    return mesh;
  });
  let min = new Vector3(Infinity, Infinity, Infinity), max = min.scale(-1);
  for (const mesh of models) {
    const bounds = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bounds.minimumWorld);
    max = Vector3.Maximize(max, bounds.maximumWorld);
  }
  const centerY = (min.y + max.y) / 2;
  const height = (max.y - min.y) * 1.04;
  const width = Math.max(max.x - min.x, max.z - min.z) * 1.08;
  const captures = [];
  const capture = top => {
    const label = `${kind}-${top ? 'top' : 'side'}`;
    const camera = new FreeCamera(`${label}-capture-camera`, top ? new Vector3(0, max.y + 40, 0) : new Vector3(0, centerY, 40), scene);
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    if (top) camera.upVector = new Vector3(0, 0, 1);
    camera.setTarget(new Vector3(0, centerY, 0));
    camera.minZ = 0.1; camera.maxZ = 100;
    camera.orthoLeft = -width / 2; camera.orthoRight = width / 2;
    camera.orthoBottom = -(top ? width : height) / 2; camera.orthoTop = -camera.orthoBottom;
    const texture = new RenderTargetTexture(`${label}-render`, 1024, scene, { generateMipMaps: true, gammaSpace: false });
    texture.activeCamera = camera; texture.renderList = models;
    texture.clearColor = new Color4(0, 0, 0, 0);
    texture.useCameraPostProcesses = false;
    texture.noPrePassRenderer = true;
    texture.refreshRate = 0; texture.hasAlpha = true;
    const result = { texture, camera, ready: false };
    texture.onAfterRenderObservable.add(() => {
      result.ready = models.every(mesh => mesh.isReady(true));
      if (!result.ready) texture.resetRefreshCounter();
    });
    scene.customRenderTargets.push(texture);
    const material = new PBRMaterial(`${label}-billboard`, scene);
    material.unlit = true; material.backFaceCulling = false;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    material.alphaCutOff = 0.35; material.albedoTexture = texture;
    material.useAlphaFromAlbedoTexture = true;
    configureMaterial(material);
    const plane = MeshBuilder.CreatePlane(`${label}-prototype`, { width, height: top ? width : height }, scene);
    const transform = top
      ? Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, min.y + (max.y - min.y) * 0.75, 0))
      : Matrix.Translation(0, centerY, 0);
    plane.bakeTransformIntoVertices(transform);
    plane.material = material; plane.setEnabled(false); plane.isPickable = false;
    Object.assign(result, { plane, material }); captures.push(result);
    return plane;
  };
  const side = capture(false), top = capture(true);
  return {
    side, top, padding: Math.max(width, height),
    get ready() { return captures.every(c => c.ready); },
    refresh() {
      for (const c of captures) c.texture.resetRefreshCounter();
    },
    dispose() {
      for (const c of captures) {
        const index = scene.customRenderTargets.indexOf(c.texture);
        if (index >= 0) scene.customRenderTargets.splice(index, 1);
        c.plane.dispose(); c.material.dispose(); c.texture.dispose(); c.camera.dispose();
      }
      models.forEach(m => m.dispose()); ownedMaterials.forEach(m => m.dispose());
    },
  };
}
