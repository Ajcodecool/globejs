import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCone, createConeMaterial } from './lightCone.js';

/**
 * Wide light beams fanning up from the stage plus a pair of thin sweeping
 * lasers. Both are hollow additive geometry with a silhouette-weighted
 * shader — no post-processing needed to read as volume in the haze.
 */
export function createBeams() {
  const group = new THREE.Group();
  const { beamCount } = CONFIG.stage;
  const originY = CONFIG.globe.yOffset + CONFIG.globe.radius;

  const beamMaterial = createConeMaterial(0x9ec8ff, 0.3, 110);
  const beamGroup = new THREE.Group();

  for (let i = 0; i < beamCount; i += 1) {
    const beam = new THREE.Mesh(createCone(26, 110), beamMaterial);
    beam.position.y = 55;
    const pivot = new THREE.Group();
    pivot.add(beam);
    pivot.rotation.y = (i / beamCount) * Math.PI * 2;
    pivot.rotation.z = 0.22 + (i % 3) * 0.07;
    beamGroup.add(pivot);
  }
  beamGroup.position.y = originY;
  group.add(beamGroup);

  const laserGroup = new THREE.Group();
  const laserMaterials = [
    createConeMaterial(0xffffff, 0.4, 240),
    createConeMaterial(0x8ab4ff, 0.3, 240),
  ];
  for (let i = 0; i < 2; i += 1) {
    const laser = new THREE.Mesh(createCone(0.5, 240), laserMaterials[i]);
    laser.position.y = 120;
    const pivot = new THREE.Group();
    pivot.add(laser);
    pivot.rotation.z = i === 0 ? 0.5 : -0.42;
    pivot.rotation.y = i === 0 ? 0.45 : -0.5;
    laserGroup.add(pivot);
  }
  laserGroup.position.y = originY;
  group.add(laserGroup);

  return {
    group,
    /**
     * @param {number} time seconds
     * @param {number} beat 0..1, from the player's audio or the fallback pulse
     * @param {number} [gain] overall beam level, low during the pre-show
     */
    update(time, beat, gain = 1) {
      beamMaterial.uniforms.uTime.value = time;
      beamMaterial.uniforms.uPulse.value = (0.55 + beat * 0.8) * gain;
      laserMaterials.forEach((material, i) => {
        material.uniforms.uTime.value = time;
        // The lasers lag the beams slightly so the two layers read separately.
        material.uniforms.uPulse.value = (0.5 + beat * (i === 0 ? 0.95 : 0.65)) * gain;
      });

      beamGroup.rotation.y = time * 0.08;
      laserGroup.rotation.y = Math.sin(time * 0.25) * 0.9;
      laserGroup.rotation.z = Math.sin(time * 0.17) * 0.12;
    },
  };
}

