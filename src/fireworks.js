import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Firework shells.
 *
 * Unlike the flare ring, these really are fireworks: a shell climbs out of the
 * stadium on a fuse, bursts into a sphere of sparks, and the sparks fall and
 * fade. Every shell is a rising ember; the break is spawned into one shared
 * pool of particles with gravity and drag, so the sphere opens up and droops
 * the way a real break does.
 *
 * One pool, one draw call, allocated up front — a cue never allocates.
 */
export function createFireworks() {
  const {
    maxSparks,
    sparksPerShell,
    launchY,
    gravity,
    drag,
    sparkLife,
    coreShare,
  } = CONFIG.fireworks;

  const positions = new Float32Array(maxSparks * 3);
  const colors = new Float32Array(maxSparks * 3);
  const velocity = new Float32Array(maxSparks * 3);
  const ages = new Float32Array(maxSparks);
  const lives = new Float32Array(maxSparks);
  const baseSizes = new Float32Array(maxSparks);
  const sizes = new Float32Array(maxSparks);
  const fades = new Float32Array(maxSparks);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aFade', new THREE.BufferAttribute(fades, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aFade;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // Generous, because a break seen from across a stadium is a big soft
        // dot of light, not a pixel.
        gl_PointSize = min(aSize * uPixelRatio * (520.0 / -mv.z), 64.0);
        vColor = aColor;
        vFade = aFade;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float core = smoothstep(0.5, 0.0, d);
        // Sparks read hot in the middle and take the shell's colour outward.
        // Only the very centre goes white; the body of the spark keeps the
        // shell's colour, or bloom bleaches the whole break.
        vec3 tint = mix(vColor, vec3(1.0), pow(core, 9.0) * 0.55);
        gl_FragColor = vec4(tint, core * vFade * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  /** Ring-buffer write cursor, so a burst overwrites the oldest dead sparks. */
  let cursor = 0;
  const shells = [];

  function spawn(x, y, z, vx, vy, vz, life, size, color) {
    const i = cursor;
    cursor = (cursor + 1) % maxSparks;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocity[i * 3] = vx;
    velocity[i * 3 + 1] = vy;
    velocity[i * 3 + 2] = vz;
    ages[i] = 0;
    lives[i] = life;
    baseSizes[i] = size;
    sizes[i] = size;
    fades[i] = 1;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const white = new THREE.Color(0xffffff);
  const accent = new THREE.Color(CONFIG.fireworks.color);

  function burst(shell) {
    const speed = [70, 118];
    for (let s = 0; s < sparksPerShell; s += 1) {
      // Uniform direction on a sphere, so the break is a proper ball.
      const theta = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      const direction = [Math.cos(theta) * r, z, Math.sin(theta) * r];

      // Sparks near the equator fly fastest; the shell's own rise carries
      // upward, which is why the ball opens into an umbrella.
      const v = speed[0] + Math.random() * (speed[1] - speed[0]);
      const hot = Math.random() < coreShare;
      const life = sparkLife[0] + Math.random() * (sparkLife[1] - sparkLife[0]);

      spawn(
        shell.x,
        shell.y,
        shell.z,
        direction[0] * v,
        direction[1] * v + shell.vy * 0.35,
        direction[2] * v,
        life,
        hot ? 11 : 6.5 + Math.random() * 4.5,
        hot ? white : shell.color,
      );
    }
  }

  return {
    points,

    /**
     * @param {object} [options]
     * @param {number} [options.color] shell tint
     * @param {number} [options.shells] how many shells to send up
     */
    trigger({ color, shells: count = CONFIG.fireworks.shells } = {}) {
      const tint = color ? accent.set(color) : accent;
      for (let i = 0; i < count; i += 1) {
        /**
         * Placement is not free: a shell only reads if it breaks inside the
         * camera's opening frame. Anything closer than the far stands breaks
         * above the top edge, and anything off to the sides breaks outside the
         * sides, so the shells go up beyond the north end and rise from behind
         * the bowl's rim — which is also where they belong at a stadium show.
         */
        const z = -(CONFIG.fireworks.nearZ + Math.random() * CONFIG.fireworks.spreadZ);
        const halfWidth = CONFIG.fireworks.spreadX * (150 - z);
        const burstY = CONFIG.fireworks.burstY[0] +
          Math.random() * (CONFIG.fireworks.burstY[1] - CONFIG.fireworks.burstY[0]);

        // Staggered fuses so the finale is a sequence, not one flat bang.
        const fuse = 0.6 + i * 0.15 + Math.random() * 0.15;
        shells.push({
          x: (Math.random() * 2 - 1) * halfWidth,
          y: launchY,
          z,
          vy: (burstY - launchY) / fuse,
          fuse,
          age: 0,
          color: tint.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
        });
      }
    },

    reset() {
      shells.length = 0;
      lives.fill(0);
      sizes.fill(0);
      fades.fill(0);
      geometry.attributes.aSize.needsUpdate = true;
      geometry.attributes.aFade.needsUpdate = true;
    },

    get active() {
      return shells.length > 0 || lives.some((life) => life > 0);
    },

    /** @param {number} dt seconds */
    update(dt) {
      // Shells climb on their fuse, trailing embers as they go.
      for (let i = shells.length - 1; i >= 0; i -= 1) {
        const shell = shells[i];
        shell.age += dt;
        shell.y += shell.vy * dt;
        spawn(shell.x, shell.y, shell.z, 0, -14, 0, 0.4, 4.4, shell.color);

        if (shell.age >= shell.fuse) {
          burst(shell);
          shells.splice(i, 1);
        }
      }

      const damping = Math.exp(-dt * drag);
      for (let i = 0; i < maxSparks; i += 1) {
        if (lives[i] <= 0) {
          if (sizes[i] !== 0) {
            sizes[i] = 0;
            fades[i] = 0;
          }
          continue;
        }

        ages[i] += dt;
        const t = ages[i] / lives[i];
        if (t >= 1) {
          lives[i] = 0;
          sizes[i] = 0;
          fades[i] = 0;
          continue;
        }

        velocity[i * 3] *= damping;
        velocity[i * 3 + 1] = velocity[i * 3 + 1] * damping - gravity * dt;
        velocity[i * 3 + 2] *= damping;

        positions[i * 3] += velocity[i * 3] * dt;
        positions[i * 3 + 1] += velocity[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;

        // Sparks shrink and fade as they cool.
        sizes[i] = baseSizes[i] * (1 - t) * (1 - t * 0.35);
        fades[i] = (1 - t) ** 1.4;
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      geometry.attributes.aFade.needsUpdate = true;
    },

    setPixelRatio(ratio) {
      material.uniforms.uPixelRatio.value = ratio;
    },
  };
}
