import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';

// Screen-door fading preserves depth writes and alpha-cutout foliage, without
// transparent-instance sorting. Each representation owns a disjoint noise range.
export class InstanceFade extends MaterialPluginBase {
  constructor(material, aoEnabled = () => false) {
    super(material, 'InstanceFade', 210, { INSTANCE_FADE: false }, true, true);
    this.aoEnabled = aoEnabled;
    this.doNotSerialize = true;
  }

  getUniforms() {
    return { ubo: [{ name: 'fadeAOEnabled', size: 1, type: 'float' }], fragment: 'uniform float fadeAOEnabled;' };
  }

  bindForSubMesh(buffer) {
    buffer.updateFloat('fadeAOEnabled', this.aoEnabled() ? 1 : 0);
  }

  prepareDefines(defines, _scene, mesh) {
    defines.INSTANCE_FADE = mesh.isVerticesDataPresent('instanceFade');
  }

  getAttributes(attributes, _scene, mesh) {
    if (mesh.isVerticesDataPresent('instanceFade')) attributes.push('instanceFade');
  }

  getCustomCode(shaderType) {
    if (shaderType === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: `
        #ifdef INSTANCE_FADE
        attribute vec2 instanceFade;
        varying vec2 vInstanceFade;
        #endif
      `,
      CUSTOM_VERTEX_MAIN_BEGIN: `
        #ifdef INSTANCE_FADE
        vInstanceFade = instanceFade;
        #endif
      `,
    };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef INSTANCE_FADE
        varying vec2 vInstanceFade;
        #endif
      `,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        #ifdef INSTANCE_FADE
        float fadeNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
        if (fadeNoise < vInstanceFade.x || fadeNoise >= vInstanceFade.y) discard;
        #endif
      `,
      CUSTOM_FRAGMENT_MAIN_END: `
        #ifdef INSTANCE_FADE
        // Reduce AO on the disappearing geometry as well as on the cards.
        // This avoids a dark seam between their different AO strengths.
        float coverage = vInstanceFade.y - vInstanceFade.x;
        gl_FragColor.a *= mix(1.0, mix(0.25, 1.0, coverage), fadeAOEnabled);
        #endif
      `,
    };
  }
}
