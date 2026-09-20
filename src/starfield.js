import * as THREE from 'three';

/**
 * Stars sit well beyond the fog's reach, so their material opts out of fog
 * (otherwise FogExp2 would erase them entirely at that distance).
 */
export function createStarfield(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    // Uniform points on a shell between r=520 and r=900.
    const radius = 520 + Math.random() * 380;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    // Mostly white, occasionally blue or amber — reads as a real night sky.
    const roll = Math.random();
    color.setHSL(roll < 0.15 ? 0.6 : roll < 0.25 ? 0.08 : 0.58, roll < 0.25 ? 0.55 : 0.12, 0.78);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.7,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(dt) {
      points.rotation.y += dt * 0.004;
    },
    /** Stars come out as the sky darkens after sunset. */
    setOpacity(opacity) {
      material.opacity = opacity;
    },
  };
}
