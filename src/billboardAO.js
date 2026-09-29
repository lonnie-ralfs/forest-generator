import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { EffectWrapper } from '@babylonjs/core/Materials/effectRenderer';

// The opaque scene's color alpha carries AO retention into the combine pass.
// Only the alpha-tested card material writes this value; cutout holes still discard.
// The combine restores opaque output, and cards write normal alpha when AO is off.
export class BillboardAO extends MaterialPluginBase {
  constructor(material, getSettings) {
    super(material, 'BillboardAO', 200, {}, true, true);
    this.getSettings = getSettings;
    this.doNotSerialize = true;
  }

  getUniforms() {
    return {
      ubo: [{ name: 'billboardAOSettings', size: 3, type: 'vec3' }],
      fragment: 'uniform vec3 billboardAOSettings;',
    };
  }

  bindForSubMesh(uniformBuffer) {
    const { enabled, distance } = this.getSettings();
    uniformBuffer.updateFloat3('billboardAOSettings', enabled ? 1 : 0, distance, 0.25);
  }

  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_MAIN_END: `
        float cardDistance = length(vPositionW - vEyePosition.xyz);
        float cardFade = smoothstep(billboardAOSettings.y, billboardAOSettings.y * 3.0, cardDistance);
        float cardAO = billboardAOSettings.z * mix(1.0, 0.25, cardFade);
        gl_FragColor.a = mix(1.0, cardAO, billboardAOSettings.x);
      `,
    };
  }
}

export function configureBillboardAO(pipelineName) {
  EffectWrapper.RegisterShaderCodeProcessing(`${pipelineName} Combiner`, {
    processCodeAfterIncludes: (_name, shaderType, code) => {
      if (shaderType !== 'fragment') return code;
      const original = 'gl_FragColor=sceneColor*ssaoColor;';
      if (!code.includes(original)) throw new Error('SSAO combine shader changed: update billboard AO integration.');
      return code.replace(original, 'gl_FragColor=vec4(sceneColor.rgb*mix(vec3(1.0),ssaoColor.rgb,sceneColor.a),1.0);');
    },
  });
}
