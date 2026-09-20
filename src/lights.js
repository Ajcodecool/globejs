import * as THREE from 'three';
import { QUALITY } from './config.js';

/**
 * The lighting rig: a hard key spot from above (the follow spot), a cold rim
 * from behind, a warm directional wash from the audience side, and a little
 * ambient so the texture never crushes to pure black.
 *
 * All lights use `decay = 0`, which keeps intensities predictable in modern
 * three.js (which otherwise treats intensities as physical candela).
 *
 * @param {THREE.Vector3} focus the point the follow spot aims at
 */
export function createLights(focus) {
  const key = new THREE.SpotLight(0xffffff, 2.6, 0, Math.PI / 4, 0.62, 0);
  key.position.set(0, 150, 20);
  key.target.position.copy(focus);
  key.castShadow = true;
  key.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  key.shadow.bias = -0.0006;
  key.shadow.camera.near = 20;
  key.shadow.camera.far = 320;

  const rim = new THREE.PointLight(0x4466ff, 1.9, 0, 0);
  rim.position.set(-80, 20, -80);

  const wash = new THREE.DirectionalLight(0xffedd6, 1.15);
  wash.position.set(0, 30, 150);

  const ambient = new THREE.AmbientLight(0xffffff, 0.34);

  // A faint blue bounce from below keeps the shadowed side readable.
  const bounce = new THREE.HemisphereLight(0x1b2a4a, 0x000000, 0.38);

  return {
    ambient,
    bounce,
    key,
    keyTarget: key.target,
    rim,
    wash,
    /**
     * Nudges the rig with the beat so the stage feels driven by the track.
     * @param {number} time seconds
     * @param {number} beat 0..1, from the player's audio or the fallback pulse
     * @param {number} [gain] overall rig level, used to hold the stage back
     *   during the pre-show before the 9:00 PM downbeat
     */
    update(time, beat, gain = 1) {
      key.intensity = (2.4 + beat * 0.9) * gain;
      rim.intensity = (1.8 + beat * 0.7) * gain;
      rim.color.setHSL(0.61 + Math.sin(time * 0.05) * 0.03, 0.85, 0.6);
      wash.intensity = (1.05 + beat * 0.25) * gain;
    },
  };
}

