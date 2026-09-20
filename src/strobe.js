import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

/**
 * The strobe.
 *
 * A full-frame flash rather than a stage light: it is the audience's whole
 * field of view going white, which is what a real strobe bank does from inside
 * a venue. It is a post pass, so it flashes the rendered scene and not the
 * chrome — the console stays readable while everything else is strobing.
 *
 * The flash is hard on/off at a fixed rate with a duty cycle, because a soft
 * sine ramp reads as a brightening, not a strobe.
 *
 * @returns {{pass: ShaderPass, trigger: Function, update: Function, reset: Function}}
 */
export function createStrobe() {
  const { color, hz, duty, level } = CONFIG.strobe;

  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uAmount;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        gl_FragColor = vec4(mix(texel.rgb, uColor, uAmount), texel.a);
      }
    `,
  });

  // Skipped entirely while idle, so the pass costs nothing during the show.
  pass.enabled = false;

  let active = false;
  let elapsed = 0;
  let duration = 0;

  return {
    pass,

    /** @param {number} seconds how long to keep strobing */
    trigger(seconds) {
      active = true;
      elapsed = 0;
      duration = seconds;
      pass.enabled = true;
    },

    reset() {
      active = false;
      elapsed = 0;
      pass.uniforms.uAmount.value = 0;
      pass.enabled = false;
    },

    get active() {
      return active;
    },

    /** Current flash level, 0..1 — 0 between flashes. */
    get amount() {
      return pass.uniforms.uAmount.value;
    },

    /** @param {number} dt seconds */
    update(dt) {
      if (!active) return;

      elapsed += dt;
      if (elapsed >= duration) {
        this.reset();
        return;
      }

      const phase = (elapsed * hz) % 1;
      pass.uniforms.uAmount.value = phase < duty ? level : 0;
    },
  };
}
