import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * The Earth itself plus a slightly larger shell that fakes atmospheric
 * scattering (a fresnel rim rendered back-side with additive blending).
 */
/**
 * @param {THREE.Texture} texture Earth colour map
 * @param {{matrix: object, texture: object, intensity: object}} [projection]
 *   uniforms shared with the projector; when supplied, the globe samples the
 *   projector's gobo in world space so the image lands on the planet like real
 *   projected light instead of spinning with the texture.
 */
export function createGlobe(texture, projection = null) {
  const { radius, segments, yOffset, tilt, spinSpeed } = CONFIG.globe;

  const group = new THREE.Group();
  let spin = spinSpeed;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.08,
  });

  /**
   * Shared with the shader patch below: 1 drains the map to its own luminance
   * (a grey planet), 0 leaves it untouched. Lives outside the patch so
   * `setGrey` works whether or not the projector is attached.
   */
  const greyUniform = { value: 0 };

  if (projection) applyProjection(material, projection, greyUniform);
  else applyGreyPatch(material, greyUniform);

  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments), material);
  shell.position.y = yOffset;
  shell.rotation.z = THREE.MathUtils.degToRad(tilt);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  // The glow shell is rotationally symmetric, so it ignores the axial tilt.
  const atmosphere = createAtmosphere(radius * 1.1);
  atmosphere.position.y = yOffset;
  group.add(atmosphere);

  const atmosphereIntensity = atmosphere.material.uniforms.uIntensity.value;

  return {
    group,
    shell,
    atmosphere,
    /** @param {number} dt seconds since last frame */
    update(dt) {
      shell.rotation.y += spin * dt;
    },

    /**
     * How lit the planet is, 0..1. The map is multiplied by the material
     * colour, so scaling that to black is a true blackout rather than a dimmer
     * grey planet — which is what a song that opens in the dark asks for. The
     * halo goes with it, because a dead planet has no atmosphere catching the
     * stage lights.
     *
     * @param {number} value 0 = dark, 1 = fully lit
     */
    setIllumination(value) {
      const level = THREE.MathUtils.clamp(value, 0, 1);
      material.color.setScalar(level);
      atmosphere.material.uniforms.uIntensity.value = atmosphereIntensity * level;
    },
    /** Current radians per second, exposed for the timed show cue. */
    get spinSpeed() {
      return spin;
    },
    /** Radians per second of idle spin. */
    setSpinSpeed(radPerSecond) {
      spin = radPerSecond;
    },
    /**
     * How greyed-out the planet's map is, 0..1. At 1 the texture is drained to
     * its own luminance — a grey Earth with its geography still readable —
     * which is how Stronger opens, before the lights bring the colour back.
     *
     * @param {number} value 0 = full colour, 1 = grey
     */
    setGrey(value) {
      greyUniform.value = THREE.MathUtils.clamp(value, 0, 1);
    },
    get grey() {
      return greyUniform.value;
    },
  };
}

/**
 * Patches the standard material so the projector's image is added to the globe's
 * emitted light. Runs in the fragment shader's emissive stage, which means the
 * pool glows through bloom without disturbing the PBR lighting underneath.
 */
function applyProjection(material, projection, greyUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uProjectorMatrix = projection.matrix;
    shader.uniforms.uProjectionMap = projection.texture;
    shader.uniforms.uProjectionIntensity = projection.intensity;
    shader.uniforms.uGrey = greyUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform mat4 uProjectorMatrix;
         varying vec4 vProjectorCoord;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vProjectorCoord = uProjectorMatrix * modelMatrix * vec4(transformed, 1.0);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uProjectionMap;
         uniform float uProjectionIntensity;
         uniform float uGrey;
         varying vec4 vProjectorCoord;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float greyLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(greyLuma), uGrey);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         if (vProjectorCoord.w > 0.0) {
           vec2 poolUV = vProjectorCoord.xy / vProjectorCoord.w;
           vec2 centered = (poolUV - 0.5) * 2.0;
           float pool = smoothstep(1.0, 0.25, length(centered));
           float onSurface = step(0.0, poolUV.x) * step(poolUV.x, 1.0)
                           * step(0.0, poolUV.y) * step(poolUV.y, 1.0);
           vec3 projected = texture2D(uProjectionMap, poolUV).rgb;
           totalEmissiveRadiance += projected * pool * onSurface * uProjectionIntensity;
         }`,
      );
  };

  // Distinct cache key: without it this patched program could be served to
  // other MeshStandardMaterial instances in the scene.
  material.customProgramCacheKey = () => 'globe-projection';
}

/**
 * The grey patch on its own, for a globe built without the projector.
 */
function applyGreyPatch(material, greyUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrey = greyUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uGrey;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float greyLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(greyLuma), uGrey);`,
      );
  };
  material.customProgramCacheKey = () => 'globe-grey';
}

/** Deep blue fresnel halo that makes the planet read against pure black. */
export function createAtmosphere(radius) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x4a86ff) },
      uIntensity: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      uniform vec3 uColor;
      uniform float uIntensity;
      void main() {
        // High exponent keeps this a thin rim instead of a fat halo.
        float rim = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 5.0);
        gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), material);
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * The performer: a pitch-black capsule silhouette standing at the pole, with a
 * barely-there sway so the shape reads as alive rather than a decal.
 */
export function createArtist() {
  const { height } = CONFIG.artist;
  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({
    color: 0x05070c,
    roughness: 0.92,
    metalness: 0.12,
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, height, 20, 1),
    material,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), material);
  head.position.y = height / 2 + 0.36;
  head.castShadow = true;
  group.add(head);

  // A hairline mic stand catches the spotlight and sells the scale.
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.5, metalness: 0.6 }),
  );
  stand.position.set(0.85, -height / 2 + 0.75, 0.2);
  stand.rotation.z = -0.08;
  stand.castShadow = true;
  group.add(stand);

  const baseY = CONFIG.globe.yOffset + CONFIG.globe.radius + height / 2;
  group.position.y = baseY;

  return {
    group,
    /** Spotlight/shadow aim point sits a touch above the body centre. */
    focus: new THREE.Vector3(0, baseY, 0),
    update(time) {
      group.position.y = baseY + Math.sin(time * 1.1) * 0.08;
      group.rotation.y = Math.sin(time * 0.35) * 0.25;
    },
  };
}
