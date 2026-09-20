import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG, REDUCED_MOTION } from './config.js';

/**
 * Camera rig: OrbitControls for explicit orbiting/zooming, plus a mouse
 * parallax that tilts the *scene group* rather than the camera. Moving the
 * camera directly would fight OrbitControls' own spherical bookkeeping.
 *
 * @param {object} options
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {HTMLElement} options.domElement
 * @param {THREE.Vector3} options.focus point the camera orbits around
 * @param {THREE.Object3D} options.parallaxGroup world group tilted by the cursor
 */
export function createRig({ camera, domElement, focus, parallaxGroup }) {
  const { start } = CONFIG.camera;

  const controls = new OrbitControls(camera, domElement);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 92;
  // Capped short of the seating bowl so the camera cannot end up inside it.
  controls.maxDistance = 280;
  // Stay above the floor plane and below the beams.
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.autoRotate = !REDUCED_MOTION;
  controls.autoRotateSpeed = 0.35;
  controls.update();

  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  let parallaxEnabled = !REDUCED_MOTION;

  domElement.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  });
  domElement.addEventListener('pointerleave', () => {
    pointer.x = 0;
    pointer.y = 0;
  });

  return {
    controls,

    /** @param {number} dt seconds */
    update(dt) {
      controls.update();

      if (!parallaxEnabled) return;

      // Frame-rate independent easing toward the cursor.
      const k = 1 - Math.pow(1 - CONFIG.parallax.ease, dt * 60);
      eased.x += (pointer.x - eased.x) * k;
      eased.y += (pointer.y - eased.y) * k;

      const strength = CONFIG.parallax.strength;
      parallaxGroup.rotation.y = eased.x * strength;
      parallaxGroup.rotation.x = eased.y * strength * 0.45;
    },

    setAutoRotate(enabled) {
      controls.autoRotate = enabled;
    },

    setParallax(enabled) {
      parallaxEnabled = enabled;
      if (!enabled) {
        eased.x = 0;
        eased.y = 0;
        parallaxGroup.rotation.set(0, 0, 0);
      }
    },

    reset() {
      camera.position.set(start.x, start.y, start.z);
      controls.target.copy(focus);
      controls.update();
    },
  };
}
