import * as THREE from 'three';

/**
 * Shared volumetric-ish light cone: an open-ended frustum rendered with an
 * additive shader that brightens where the shell faces the camera edge-on, so
 * it reads as a hollow shaft of light in the haze.
 */

/** Narrow at the source, widening away from it. */
export function createCone(topRadius, height, baseRadius = 1.1, segments = 26) {
  return new THREE.CylinderGeometry(topRadius, baseRadius, height, segments, 1, true);
}

export function createConeMaterial(color, opacity, height) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uHeight: { value: height },
      uTime: { value: 0 },
      uPulse: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      uniform float uHeight;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        // CylinderGeometry spans -height/2..height/2 in local Y.
        vHeight = clamp((position.y + uHeight * 0.5) / uHeight, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uPulse;
      void main() {
        // Brighter where the shell faces us edge-on: reads as a hollow cone.
        float edge = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float fade = pow(1.0 - vHeight, 1.4);
        float shimmer = 0.92 + 0.08 * sin(uTime * 2.3 + vHeight * 12.0);
        float alpha = pow(edge, 1.35) * fade * uOpacity * uPulse * shimmer;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Points a cone at a target: the narrow end sits at the source, the wide end
 * at the target.
 */
export function aimCone(mesh, from, to) {
  const direction = new THREE.Vector3().subVectors(to, from);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return direction.length();
}
