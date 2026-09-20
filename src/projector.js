import * as THREE from 'three';
import { CONFIG, QUALITY } from './config.js';
import { createCone, createConeMaterial, aimCone } from './lightCone.js';
import { createPuffTexture } from './smoke.js';

/**
 * The stadium projector: a rig up in the bleachers throwing an image across the
 * field onto the planet.
 *
 * It is built from four parts:
 *   1. a real spotlight, so the globe is genuinely lit from that direction;
 *   2. a visible beam cone from the lens to the planet;
 *   3. dust motes drifting inside the beam;
 *   4. a projection matrix + gobo texture, which the globe's material samples
 *      in world space — so the image stays put while the Earth turns under it,
 *      exactly like a real projected image would.
 *
 * @returns {{group: THREE.Group, light: THREE.SpotLight, uniform: object, update: Function}}
 */
export function createProjector() {
  const group = new THREE.Group();

  const position = new THREE.Vector3(
    CONFIG.projector.position.x,
    CONFIG.projector.position.y,
    CONFIG.projector.position.z,
  );
  const target = new THREE.Vector3(
    CONFIG.projector.target.x,
    CONFIG.projector.target.y,
    CONFIG.projector.target.z,
  );

  /* ---------------- 1. the light itself ---------------- */
  const light = new THREE.SpotLight(
    0xd7e8ff,
    CONFIG.projector.lightIntensity,
    0,
    THREE.MathUtils.degToRad(CONFIG.projector.fov / 2),
    0.45,
    0,
  );
  light.position.copy(position);
  light.target.position.copy(target);
  light.castShadow = false;
  group.add(light, light.target);

  /* ---------------- 2. the beam ---------------- */
  const distance = position.distanceTo(target);
  const beamOpacity = 0.16;
  const beamMaterial = createConeMaterial(0xbcd6ff, beamOpacity, distance);
  const beam = new THREE.Mesh(createCone(CONFIG.projector.poolRadius, distance, 1.6, 32), beamMaterial);
  aimCone(beam, position, target);
  group.add(beam);

  /* ---------------- 3. dust in the beam ---------------- */
  const dustCount = QUALITY.projectorDust;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustT = new Float32Array(dustCount);
  const dustAngle = new Float32Array(dustCount);
  const dustSpread = new Float32Array(dustCount);

  for (let i = 0; i < dustCount; i += 1) {
    dustT[i] = Math.random();
    dustAngle[i] = Math.random() * Math.PI * 2;
    dustSpread[i] = Math.sqrt(Math.random());
  }

  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      size: 2.6,
      map: createPuffTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0xdfe9ff,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;
  group.add(dust);

  const beamDirection = new THREE.Vector3().subVectors(target, position).normalize();
  const lateral = new THREE.Vector3(-beamDirection.z, 0, beamDirection.x).normalize();
  const up = new THREE.Vector3().crossVectors(lateral, beamDirection).normalize();

  /* ---------------- 4. the projected image ---------------- */
  const gobo = createGoboTexture();
  const projectionCamera = new THREE.PerspectiveCamera(CONFIG.projector.fov, 1, 1, distance * 2);
  projectionCamera.position.copy(position);
  projectionCamera.lookAt(target);
  projectionCamera.updateMatrixWorld(true);

  const uniform = {
    matrix: {
      value: new THREE.Matrix4().multiplyMatrices(
        projectionCamera.projectionMatrix,
        projectionCamera.matrixWorldInverse,
      ),
    },
    texture: { value: gobo },
    intensity: { value: CONFIG.projector.projectionIntensity },
  };

  const lens = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createPuffTexture(),
      color: 0xcfe2ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  lens.position.copy(position);
  lens.scale.setScalar(26);
  group.add(lens);

  const poolRadius = CONFIG.projector.poolRadius;
  const writeDust = (drift) => {
    const array = dustGeometry.attributes.position.array;
    for (let i = 0; i < dustCount; i += 1) {
      const t = dustT[i];
      // The beam widens with distance from the lens.
      const radius = 1.6 + (poolRadius - 1.6) * t;
      const r = dustSpread[i] * radius;
      const offset = lateral.clone().multiplyScalar(Math.cos(dustAngle[i]) * r);
      offset.addScaledVector(up, Math.sin(dustAngle[i]) * r);

      const point = position.clone().addScaledVector(beamDirection, t * distance).add(offset);
      array[i * 3] = point.x;
      array[i * 3 + 1] = point.y;
      array[i * 3 + 2] = point.z;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    void drift;
  };

  writeDust(0);

  /** Cleared by the panel toggle; the gain is applied on top of it. */
  let projectionEnabled = true;

  return {
    group,
    light,
    uniform,

    /**
     * @param {number} dt seconds
     * @param {number} time seconds
     * @param {number} beat 0..1 from the music
     * @param {number} [gain] rig level, so a blacked-out stage really is black
     */
    update(dt, time, beat, gain = 1) {
      // Dust drifts along the beam, so the shaft always has motion in it.
      for (let i = 0; i < dustCount; i += 1) {
        dustT[i] += dt * 0.05 * (0.4 + dustSpread[i]);
        if (dustT[i] > 1) dustT[i] -= 1;
      }
      writeDust(time);

      // Projector lamps flicker a little, and the rig pumps with the track.
      const flicker = 0.94 + 0.06 * Math.sin(time * 13.1) + 0.02 * Math.sin(time * 41.7);
      uniform.intensity.value = projectionEnabled
        ? CONFIG.projector.projectionIntensity * flicker * (1 + beat * 0.35) * gain
        : 0;

      beamMaterial.uniforms.uTime.value = time;
      beamMaterial.uniforms.uPulse.value = (0.75 + beat * 0.5) * gain;
      light.intensity = CONFIG.projector.lightIntensity * flicker * (1 + beat * 0.3) * gain;
    },

    setBeamVisible(visible) {
      beam.visible = visible;
      dust.visible = visible;
      lens.visible = visible;
      light.visible = visible;
    },

    setProjectionVisible(visible) {
      projectionEnabled = visible;
      if (!visible) uniform.intensity.value = 0;
    },
  };
}

/**
 * The gobo: a bright pool with rings, spokes and a fine dot grid, drawn to a
 * canvas so the site has no image dependencies. Bright on black, because the
 * globe shader adds it straight onto the surface.
 */
function createGoboTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // Soft pool: white core falling off to cold blue.
  const pool = ctx.createRadialGradient(c, c, 0, c, c, c);
  pool.addColorStop(0, 'rgba(255,255,255,0.95)');
  pool.addColorStop(0.35, 'rgba(206,226,255,0.5)');
  pool.addColorStop(0.72, 'rgba(120,168,255,0.16)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, size, size);

  // Concentric rings, like a stage gobo.
  ctx.lineWidth = 2;
  for (let i = 1; i <= 5; i += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.26 - i * 0.035})`;
    ctx.beginPath();
    ctx.arc(c, c, (i / 6) * c * 1.05, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spokes.
  ctx.strokeStyle = 'rgba(210,230,255,0.16)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * c * 0.12, c + Math.sin(a) * c * 0.12);
    ctx.lineTo(c + Math.cos(a) * c * 0.98, c + Math.sin(a) * c * 0.98);
    ctx.stroke();
  }

  // Fine dot grid — the texture that makes it read as a projected image.
  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const dx = x - c;
      const dy = y - c;
      if (dx * dx + dy * dy > c * c) continue;
      ctx.fillStyle = `rgba(190,215,255,${0.12 + 0.1 * Math.random()})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Centre hot spot.
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.09);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(c - size * 0.09, c - size * 0.09, size * 0.18, size * 0.18);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
