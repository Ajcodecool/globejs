import * as THREE from 'three';
import { CONFIG } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
/** Height of the streak cylinder's geometry, before it is stretched. */
const ROD_HEIGHT = 8;

/**
 * Red stadium flares, not fireworks: one controlled spark fired from each
 * station on a clean ring around the globe.
 *
 * They are *launched*, not switched on. At the cue every flare is fired from its
 * place on the ring, up and outward at an angle, trailing a streak while it is
 * fast and slowing as it crosses the top of its arc. The arc is tuned to the
 * burn, so a flare is coming back down to the ring about as it gutters out,
 * which is also what keeps the volley symmetrical instead of drifting away.
 */
export function createFlares() {
  const group = new THREE.Group();
  const count = CONFIG.flares.count;
  const duration = CONFIG.flares.duration;
  const launch = CONFIG.flares.launch;
  const radius = CONFIG.globe.radius + CONFIG.flares.radiusOffset;
  // The equator is hidden by the black horizon/player framing. Lift the band
  // onto the upper hemisphere so the red ring reads around the visible globe.
  const flareBandY = CONFIG.globe.yOffset + 36;

  /**
   * Three parallel buffers, in the same order:
   *   launches   — where each flare is fired from (never changes)
   *   velocities — its muzzle velocity
   *   positions  — where it is *now* (what the geometry actually draws)
   */
  const launches = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);

  const phases = new Float32Array(count);
  const heights = new Float32Array(count);
  const angles = new Float32Array(count);

  const flareMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aHeight;
      uniform float uTime;
      uniform float uIntensity;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float flutter = sin(uTime * 18.0 + aPhase * 15.0) * 0.9;
        p.y += flutter * uIntensity;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (aHeight * 2.5 + 4.0) * (210.0 / -mv.z) * (0.5 + uIntensity);
        vGlow = uIntensity * (0.82 + 0.18 * sin(uTime * 22.0 + aPhase * 10.0));
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vGlow;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float core = smoothstep(0.18, 0.0, d);
        float halo = smoothstep(0.5, 0.05, d) * 0.32;
        gl_FragColor = vec4(2.4, 0.012, 0.002, (core + halo) * vGlow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    angles[i] = angle;
    phases[i] = Math.random() * Math.PI * 2;
    // Sized for the far end of the arc: a flare is 2-3x further from the camera
    // once it is up in the sky than it was on the ring, so the head has to carry
    // real weight or the volley reads as faint dots.
    heights[i] = 4.5 + Math.random() * 5.5;

    const stationX = Math.cos(angle) * radius;
    const stationZ = Math.sin(angle) * radius;
    const stationY = flareBandY + (Math.random() - 0.5) * 7;
    launches[i * 3] = stationX;
    launches[i * 3 + 1] = stationY;
    launches[i * 3 + 2] = stationZ;

    /**
     * Fired outward along its own spoke of the ring and up at `elevationDeg`.
     * Outward rather than all one way is what makes the volley read as a crown
     * around the globe instead of a direction the audience is being shot at.
     */
    const elevation = THREE.MathUtils.degToRad(
      launch.elevationDeg + (Math.random() - 0.5) * launch.spreadDeg,
    );
    const speed = launch.speed * (0.94 + Math.random() * 0.12);
    const outward = Math.cos(elevation) * speed;
    velocities[i * 3] = Math.cos(angle) * outward;
    velocities[i * 3 + 1] = Math.sin(elevation) * speed;
    velocities[i * 3 + 2] = Math.sin(angle) * outward;
  }

  // Start parked on the launch stations.
  positions.set(launches);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));
  const points = new THREE.Points(geometry, flareMaterial);
  points.frustumCulled = false;
  points.visible = false;
  group.add(points);

  // A thin red ring in the same plane as the launch stations, so the eye reads
  // them as deliberately staged around the globe. Kept dim: seen near edge-on it
  // is a long straight line, and anything brighter reads as a stray laser streak
  // across the whole composition rather than a stadium effect. It is the
  // ignition line, so it fades out as the flares climb away.
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xff1608,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.16, 8, 128),
    ringMaterial,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = flareBandY;
  group.add(ring);

  /**
   * One halo and one streak per flare, both tracking the head. These are
   * depth-tested like the spark itself: a flare that climbs behind the planet or
   * the far stand has to be occluded by it, or the glow floats through the
   * geometry.
   */
  const haloTexture = createHaloTexture();
  const halos = [];
  const rods = [];
  const rodGeometry = new THREE.CylinderGeometry(0.9, 1.4, ROD_HEIGHT, 8);
  for (let i = 0; i < count; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture,
      color: 0xff210f,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sprite.position.set(launches[i * 3], launches[i * 3 + 1], launches[i * 3 + 2]);
    sprite.scale.setScalar(11);
    group.add(sprite);
    halos.push(sprite);

    const rod = new THREE.Mesh(rodGeometry, new THREE.MeshBasicMaterial({
      color: 0xff1408,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    rod.position.copy(sprite.position);
    rod.scale.y = 0.35;
    group.add(rod);
    rods.push(rod);
  }

  let active = false;
  let elapsed = 0;

  // Scratch vectors, so the per-frame update allocates nothing.
  const head = new THREE.Vector3();
  const direction = new THREE.Vector3();

  const hide = () => {
    points.visible = false;
    ringMaterial.opacity = 0;
    halos.forEach((halo) => { halo.material.opacity = 0; });
    rods.forEach((rod) => { rod.material.opacity = 0; });
  };

  const reset = () => {
    active = false;
    elapsed = 0;
    hide();
    // Park every flare back on its launch station, so a replayed cue fires from
    // the ring again rather than from wherever the last volley burned out.
    positions.set(launches);
    positionAttribute.needsUpdate = true;
    rods.forEach((rod) => { rod.quaternion.identity(); });
    halos.forEach((halo, i) => {
      halo.position.set(launches[i * 3], launches[i * 3 + 1], launches[i * 3 + 2]);
      halo.scale.setScalar(11);
    });
  };

  return {
    group,
    get active() {
      return active;
    },
    /** Fire the volley at the musical cue. */
    trigger() {
      active = true;
      elapsed = 0;
      points.visible = true;
    },
    reset,
    /**
     * Pure animation state machine — the cue itself is timed by the caller, so
     * playback scrubbing and replay logic lives in one place.
     *
     * @param {number} dt seconds
     * @param {number} beat 0..1 from the music
     */
    update(dt, beat) {
      if (!active) return;

      elapsed += dt;
      const t = elapsed;
      const g = launch.gravity;
      const apexAt = duration * 0.5;

      flareMaterial.uniforms.uTime.value += dt;

      /**
       * The burn: instant ignition, held through the ascent, then a gutter back
       * to embers as the flare falls. Peaking rather than decaying from the
       * first frame matters now that there is an ascent to watch.
       */
      const attack = Math.min(1, elapsed / 0.18);
      const decay = 1 - Math.max(0, (elapsed - apexAt) / (duration - apexAt));
      const intensity = Math.min(1.4, attack * decay + beat * 0.18);
      flareMaterial.uniforms.uIntensity.value = intensity;

      ringMaterial.opacity = intensity * 0.18 * Math.max(0, 1 - elapsed / launch.ringFade);
      ring.rotation.z += dt * 0.18;

      for (let i = 0; i < count; i += 1) {
        const o = i * 3;
        const vx = velocities[o];
        const vy = velocities[o + 1];
        const vz = velocities[o + 2];

        // Ballistic arc from the station: p = p0 + v*t - ½gt².
        const x = launches[o] + vx * t;
        const y = launches[o + 1] + vy * t - 0.5 * g * t * t;
        const z = launches[o + 2] + vz * t;
        positions[o] = x;
        positions[o + 1] = y;
        positions[o + 2] = z;
        head.set(x, y, z);

        // The streak follows the current velocity: long while the flare is
        // fast off the line, collapsing to a dot as it hangs at the apex.
        const cvy = vy - g * t;
        const speedNow = Math.hypot(vx, cvy, vz);

        const flicker = 0.85 + 0.15 * Math.sin(elapsed * 20 + phases[i]);

        halos[i].position.copy(head);
        halos[i].material.opacity = intensity * flicker * 1.35;
        halos[i].scale.setScalar(8 + intensity * 14);

        const rod = rods[i];
        if (speedNow > 0.001) {
          direction.set(vx, cvy, vz).divideScalar(speedNow);
          rod.quaternion.setFromUnitVectors(UP, direction);
        } else {
          direction.copy(UP);
        }
        const trailLength = Math.min(
          launch.maxTrail,
          Math.max(launch.minTrail, speedNow * launch.trailPerSpeed),
        );
        rod.material.opacity = intensity * flicker * 0.95;
        rod.scale.set(1, trailLength / ROD_HEIGHT, 1);
        // Trailing behind the head, so the head itself stays on the arc.
        rod.position.copy(head).addScaledVector(direction, -trailLength * 0.5);
      }
      positionAttribute.needsUpdate = true;

      // Burn over: stop the machine rather than letting sixteen spent flares
      // keep flying outward off-screen with nothing drawn.
      if (elapsed > duration) {
        hide();
        active = false;
      }
    },
  };
}

function createHaloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,45,20,0.9)');
  gradient.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
