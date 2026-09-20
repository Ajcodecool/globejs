import * as THREE from 'three';

/**
 * Phone lights.
 *
 * The stands and the mosh pit are the same thing seen from different distances
 * — a field of small emissive points, each twinkling on its own phase — so they
 * share one shader. `aRowdy` marks the points standing in a pit: those bob
 * harder and flash faster than the ones watching from a seat.
 */

/**
 * @param {object} [options]
 * @param {number} [options.color]      base tint of the lights
 * @param {number} [options.intensity]  additive strength
 * @param {number} [options.bob]        idle vertical sway, in units
 * @param {number} [options.pointScale] px constant; larger for distant crowds
 */
export function createCrowdMaterial({
  color = 0xcfe0ff,
  intensity = 2.05,
  bob = 0.9,
  pointScale = 390,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      /** Throttled from the beat: the floor jumps, the stands do not. */
      uEnergy: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      attribute float aRowdy;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uEnergy;
      varying float vTwinkle;
      void main() {
        vec3 p = position;
        float bounce = sin(uTime * (1.1 + aRowdy * 2.6) + aPhase * 6.283);
        p.y += bounce * ${bob.toFixed(2)} * (1.0 + aRowdy * 2.4) * mix(1.0, uEnergy, aRowdy);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // Sharp, irregular pulses; most phones are down at any moment.
        float wave = sin(uTime * (1.6 + aRowdy * 1.8) + aPhase * 6.283);
        vTwinkle = 0.16 + 0.84 * pow(max(wave, 0.0), 3.0);
        gl_PointSize = min(aSize * uPixelRatio * (${pointScale.toFixed(1)} / -mv.z), 26.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, alpha * vTwinkle * uIntensity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Build one crowd from a placement callback.
 *
 * @param {object} options
 * @param {number} options.count
 * @param {THREE.ShaderMaterial} options.material
 * @param {(index: number) => {x: number, y: number, z: number, size: number, rowdy?: number}} options.place
 */
export function createCrowdPoints({ count, material, place }) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const rowdy = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const point = place(i);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    phases[i] = Math.random();
    sizes[i] = point.size;
    rowdy[i] = point.rowdy ?? 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aRowdy', new THREE.BufferAttribute(rowdy, 1));

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(time) {
      material.uniforms.uTime.value = time;
    },
    /** @param {number} energy 0..1 — how hard the floor is jumping. */
    setEnergy(energy) {
      material.uniforms.uEnergy.value = 0.45 + energy;
    },
    setPixelRatio(ratio) {
      material.uniforms.uPixelRatio.value = ratio;
    },
  };
}
