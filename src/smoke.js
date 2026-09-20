import * as THREE from 'three';
import { CONFIG } from './config.js';

/** Soft radial puff, drawn to a canvas so there are no image dependencies. */
export function createPuffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * A thick bed of stage haze: particles ring the globe's equator, drift upward
 * and recycle at the top so the volume never runs empty.
 */
export function createSmoke(count) {
  const { minRadius, maxRadius, riseSpeed, driftSpeed, bedTop } = CONFIG.smoke;
  const floorY = CONFIG.globe.yOffset + CONFIG.stage.floorOffset;

  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);

  // The bed hugs the floor: anything lower would be hidden behind the plane.
  const bedBottom = floorY - 3;
  const bedCeiling = floorY + bedTop;

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = bedBottom + Math.random() * (bedCeiling - bedBottom);
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    speeds[i] = 0.35 + Math.random() * 1.15;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 26,
    map: createPuffTexture(),
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    color: 0x9aa7bd,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(dt, time) {
      const array = geometry.attributes.position.array;
      for (let i = 0; i < count; i += 1) {
        const y = i * 3 + 1;
        array[y] += speeds[i] * riseSpeed * dt;
        // Recycle once a puff clears the top of the bed.
        if (array[y] > bedCeiling) array[y] = bedBottom;
        array[y] += Math.sin(time * 0.5 + phases[i]) * 0.01;
      }
      geometry.attributes.position.needsUpdate = true;
      points.rotation.y -= driftSpeed * dt;
    },
  };
}
