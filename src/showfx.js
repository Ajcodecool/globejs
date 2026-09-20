import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCone, createConeMaterial } from './lightCone.js';

/**
 * Stronger's production effects — the pieces only this song uses.
 *
 * Four toys, one module:
 *
 *   X beams         two pairs of large beams rising behind the dome, each pair
 *                   leaning into a sharp X. They *grow* out of the ground
 *                   behind the globe, reaching past its apex, and hold while
 *                   `xBeamsEnd` fades them out.
 *
 *   red flash       a stadium-wide red wash layered as a full-frame post pass,
 *                   like the strobe but coloured and single-shot with a decay.
 *
 *   red pyro        concussive bursts fired outward from around the base ring
 *                   — a cross between the flare ring and the fireworks pool.
 *
 *   golden fountains  vertical columns of sparks climbing behind the globe,
 *                   held on for a wall of smoke and light.
 */
export function createShowFX() {
  const group = new THREE.Group();
  const fx = CONFIG.showfx;

  /* ---------------- X beams ---------------- */

  const originY = CONFIG.globe.yOffset + CONFIG.globe.radius;
  // Behind the dome relative to the default camera, and wide enough that the
  // crossing point sits in open sky rather than against the planet's disc.
  const xBeamDistance = fx.xBeam.distance;

  const xMaterials = [];
  const xPivots = [];
  const xBeamGroup = new THREE.Group();
  xBeamGroup.position.y = originY - 6;

  for (let pair = 0; pair < 2; pair += 1) {
    for (const lean of [1, -1]) {
      const material = createConeMaterial(fx.xBeam.color, fx.xBeam.opacity, fx.xBeam.height);
      xMaterials.push(material);
      const beam = new THREE.Mesh(createCone(fx.xBeam.topRadius, fx.xBeam.height, fx.xBeam.baseRadius), material);
      // Narrow end at the ground, wide end in the sky; length is scaled in
      // update() so the beams visibly climb during the phase.
      beam.position.y = fx.xBeam.height * 0.5;
      const pivot = new THREE.Group();
      pivot.add(beam);
      // Legs stand apart at ground level and lean inward, so the X crosses in
      // open sky above the dome rather than behind its silhouette.
      // Both legs share the origin behind the dome and lean opposite ways, so
      // the pair crosses into an X whose vertex hangs above the dome's
      // silhouette — in open sky from the house camera.
      pivot.rotation.z = lean * fx.xBeam.leanAngle;
      pivot.rotation.y = pair === 0 ? fx.xBeam.pairYaw : -fx.xBeam.pairYaw;
      pivot.userData.lean = lean;
      pivot.scale.y = 0.001;
      xPivots.push(pivot);
      xBeamGroup.add(pivot);
    }
  }
  // Park the whole rig behind the dome, on the far side of the globe.
  xBeamGroup.position.z = -xBeamDistance;
  group.add(xBeamGroup);

  let xState = 'idle'; // idle | growing | holding | fading
  let xTime = 0;

  /* ---------------- red flash ---------------- */

  const flashMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color(fx.redFlash.color) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // Full-screen in clip space, bypassing the camera entirely: the wash
        // is a property of the frame, not something standing in the world.
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        // Strongest at the frame edges: a wash rolling over the stands rather
        // than a spotlight blown up to cover the screen.
        float edge = smoothstep(0.15, 0.85, length(vUv - 0.5) * 2.0);
        gl_FragColor = vec4(uColor, uAmount * (0.45 + 0.55 * edge));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMaterial);
  flashQuad.frustumCulled = false;
  flashQuad.visible = false;
  flashQuad.renderOrder = 999;
  flashQuad.onBeforeRender = (renderer) => {
    renderer.autoClear = false;
  };
  group.add(flashQuad);

  let flashAmount = 0;

  /** @param {number} seconds decay length */
  function triggerRedFlash(seconds) {
    flashAmount = fx.redFlash.level;
    flashQuad.visible = true;
    flashDecay = seconds;
  }
  let flashDecay = 1.2;

  /* ---------------- red pyro: base-ring bursts ---------------- */

  const pyro = {
    positions: new Float32Array(fx.redPyro.maxSparks * 3),
    velocity: new Float32Array(fx.redPyro.maxSparks * 3),
    colors: new Float32Array(fx.redPyro.maxSparks * 3),
    ages: new Float32Array(fx.redPyro.maxSparks),
    lives: new Float32Array(fx.redPyro.maxSparks),
    baseSizes: new Float32Array(fx.redPyro.maxSparks),
    sizes: new Float32Array(fx.redPyro.maxSparks),
    fades: new Float32Array(fx.redPyro.maxSparks),
    cursor: 0,
    live: 0,
  };
  const pyroGeometry = new THREE.BufferGeometry();
  pyroGeometry.setAttribute('position', new THREE.BufferAttribute(pyro.positions, 3));
  pyroGeometry.setAttribute('aColor', new THREE.BufferAttribute(pyro.colors, 3));
  pyroGeometry.setAttribute('aSize', new THREE.BufferAttribute(pyro.sizes, 1));
  pyroGeometry.setAttribute('aFade', new THREE.BufferAttribute(pyro.fades, 1));
  const pyroMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
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
        vec3 tint = mix(vColor, vec3(1.0), pow(core, 9.0) * 0.5);
        gl_FragColor = vec4(tint, core * vFade * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pyroPoints = new THREE.Points(pyroGeometry, pyroMaterial);
  pyroPoints.frustumCulled = false;
  group.add(pyroPoints);

  function pyroSpawn(x, y, z, vx, vy, vz, life, size, color) {
    const i = pyro.cursor;
    pyro.cursor = (pyro.cursor + 1) % fx.redPyro.maxSparks;
    pyro.positions[i * 3] = x;
    pyro.positions[i * 3 + 1] = y;
    pyro.positions[i * 3 + 2] = z;
    pyro.velocity[i * 3] = vx;
    pyro.velocity[i * 3 + 1] = vy;
    pyro.velocity[i * 3 + 2] = vz;
    pyro.ages[i] = 0;
    pyro.lives[i] = life;
    pyro.baseSizes[i] = size;
    pyro.sizes[i] = size;
    pyro.fades[i] = 1;
    pyro.colors[i * 3] = color.r;
    pyro.colors[i * 3 + 1] = color.g;
    pyro.colors[i * 3 + 2] = color.b;
  }

  const red = new THREE.Color(fx.redPyro.color);
  const gold = new THREE.Color(fx.fountain.color);

  /**
   * Bursts all the way around the base of the globe, slightly staggered so it
   * reads as a ring of concussions rather than one explosion.
   */
  function triggerRedPyro() {
    const radius = CONFIG.globe.radius + 14;
    const baseY = CONFIG.globe.yOffset + 4;
    const stations = 12;
    for (let s = 0; s < stations; s += 1) {
      const angle = (s / stations) * Math.PI * 2;
      const sx = Math.cos(angle) * radius;
      const sz = Math.sin(angle) * radius;
      // Outward and up, concussive: most energy along the ring's own spoke.
      for (let p = 0; p < fx.redPyro.sparksPerBurst; p += 1) {
        const spread = 0.55;
        const dx = Math.cos(angle) + (Math.random() - 0.5) * spread;
        const dz = Math.sin(angle) + (Math.random() - 0.5) * spread;
        const dy = 0.9 + Math.random() * 1.4;
        const speed = fx.redPyro.speed * (0.7 + Math.random() * 0.6);
        const len = Math.hypot(dx, dy, dz);
        pyroSpawn(
          sx, baseY + Math.random() * 6, sz,
          (dx / len) * speed, (dy / len) * speed, (dz / len) * speed,
          fx.redPyro.life[0] + Math.random() * (fx.redPyro.life[1] - fx.redPyro.life[0]),
          5 + Math.random() * 6,
          red.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
        );
      }
    }
  }

  /**
   * Golden fountains: vertical columns of sparks erupting from the ground
   * behind the globe, held on for a while so they build a wall of light.
   */
  let fountainTimer = 0;
  let fountainRemaining = 0;
  function triggerGoldenFountains(seconds) {
    fountainRemaining = seconds;
    fountainTimer = 0;
  }
  const fountainJets = fx.fountain.jets.map(([x, z]) => ({ x, z }));

  function fountainStep(dt) {
    if (fountainRemaining <= 0) return;
    fountainRemaining -= dt;
    fountainTimer -= dt;
    if (fountainTimer > 0) return;
    fountainTimer = fx.fountain.emitInterval;

    const groundY = CONFIG.globe.yOffset + CONFIG.globe.radius - 26;
    for (const jet of fountainJets) {
      for (let p = 0; p < fx.fountain.sparksPerEmit; p += 1) {
        const jitterX = (Math.random() - 0.5) * 3.2;
        const jitterZ = (Math.random() - 0.5) * 3.2;
        pyroSpawn(
          jet.x + jitterX, groundY, jet.z + jitterZ,
          jitterX * 1.6,
          fx.fountain.speed * (0.75 + Math.random() * 0.5),
          jitterZ * 1.6,
          fx.fountain.life[0] + Math.random() * (fx.fountain.life[1] - fx.fountain.life[0]),
          4.5 + Math.random() * 5,
          gold.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.1),
        );
      }
    }
  }

  /* ---------------- public surface ---------------- */

  return {
    group,

    /** Large beams behind the dome begin climbing out of the ground. */
    xBeams() {
      xState = 'growing';
      xTime = 0;
      xBeamGroup.visible = true;
    },

    /** The beams have reached the globe: fade the whole rig out. */
    xBeamsEnd() {
      if (xState === 'growing' || xState === 'holding') xState = 'fading';
    },

    get xBeamPhase() {
      return xState;
    },

    triggerRedFlash,
    triggerRedPyro,
    triggerGoldenFountains,

    reset() {
      xState = 'idle';
      xTime = 0;
      xBeamGroup.visible = false;
      xPivots.forEach((pivot) => { pivot.scale.y = 0.001; });
      // Restore the pulse a previous fade left at zero, or the next volley
      // would grow to full size and still be invisible.
      xMaterials.forEach((material) => { material.uniforms.uPulse.value = 1; });
      flashAmount = 0;
      flashQuad.visible = false;
      flashMaterial.uniforms.uAmount.value = 0;
      pyro.lives.fill(0);
      pyro.sizes.fill(0);
      pyro.fades.fill(0);
      pyroGeometry.attributes.aSize.needsUpdate = true;
      pyroGeometry.attributes.aFade.needsUpdate = true;
      fountainRemaining = 0;
    },

    get active() {
      return xState !== 'idle' || flashAmount > 0 || pyro.lives.some((l) => l > 0) || fountainRemaining > 0;
    },

    /** @param {number} dt seconds */
    update(dt) {
      // --- X beams ---
      if (xState === 'growing') {
        xTime += dt;
        const t = Math.min(1, xTime / fx.xBeam.growSeconds);
        // Ease-out so the climb decelerates as it reaches the globe.
        const eased = 1 - Math.pow(1 - t, 2.2);
        xPivots.forEach((pivot) => { pivot.scale.y = Math.max(0.001, eased); });
        if (t >= 1) xState = 'holding';
      } else if (xState === 'fading') {
        xTime += dt;
        const t = Math.min(1, xTime / fx.xBeam.fadeSeconds);
        const level = 1 - t;
        xPivots.forEach((pivot) => { pivot.scale.y = Math.max(0.001, level); });
        xMaterials.forEach((material) => {
          material.uniforms.uPulse.value = level;
        });
        if (t >= 1) {
          xState = 'idle';
          xBeamGroup.visible = false;
        }
      }

      // --- red flash decay ---
      if (flashAmount > 0) {
        flashAmount = Math.max(0, flashAmount - (dt / flashDecay) * fx.redFlash.level);
        flashMaterial.uniforms.uAmount.value = flashAmount;
        if (flashAmount === 0) flashQuad.visible = false;
      }

      // --- shared spark pool: pyro + fountains ---
      fountainStep(dt);
      const damping = Math.exp(-dt * fx.redPyro.drag);
      let live = 0;
      for (let i = 0; i < fx.redPyro.maxSparks; i += 1) {
        if (pyro.lives[i] <= 0) {
          if (pyro.sizes[i] !== 0) {
            pyro.sizes[i] = 0;
            pyro.fades[i] = 0;
          }
          continue;
        }
        live += 1;
        pyro.ages[i] += dt;
        const t = pyro.ages[i] / pyro.lives[i];
        if (t >= 1) {
          pyro.lives[i] = 0;
          pyro.sizes[i] = 0;
          pyro.fades[i] = 0;
          continue;
        }
        pyro.velocity[i * 3] *= damping;
        pyro.velocity[i * 3 + 1] = pyro.velocity[i * 3 + 1] * damping - fx.redPyro.gravity * dt;
        pyro.velocity[i * 3 + 2] *= damping;
        pyro.positions[i * 3] += pyro.velocity[i * 3] * dt;
        pyro.positions[i * 3 + 1] += pyro.velocity[i * 3 + 1] * dt;
        pyro.positions[i * 3 + 2] += pyro.velocity[i * 3 + 2] * dt;
        pyro.sizes[i] = pyro.baseSizes[i] * (1 - t) * (1 - t * 0.35);
        pyro.fades[i] = (1 - t) ** 1.4;
      }
      pyro.live = live;
      if (live > 0 || pyro.cursor !== 0) {
        pyroGeometry.attributes.position.needsUpdate = true;
        pyroGeometry.attributes.aSize.needsUpdate = true;
        pyroGeometry.attributes.aFade.needsUpdate = true;
      }
    },
  };
}
