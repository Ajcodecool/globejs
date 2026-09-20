import { CONFIG, QUALITY } from './config.js';
import { createCrowdMaterial, createCrowdPoints } from './crowd.js';

/**
 * The floor crowd.
 *
 * The stage stands on the 50, so the floor is a standing crowd ringing it:
 * a tight crush against the stage, thinning out across the field. A fifth of
 * the crush is marked rowdy, which in the shader means a harder bounce and a
 * faster flash — the pit rather than the people watching from the crush
 * barrier. Energy comes from the music, so the floor jumps on the beat.
 */

export function createMosh() {
  const { halfWidth: W, straightHalfLength: L } = CONFIG.stadium;
  const count = QUALITY.mosh;

  // The globe occupies r < 60, so the crush starts clear of its silhouette.
  const CRUSH_INNER = 74;
  const CRUSH_OUTER = 190;
  // How much of the floor is crush rather than standing room.
  const CRUSH_SHARE = 0.72;
  const FIELD_OUTER = 470;

  /** Is this point on the field, inside the front row? */
  function onField(x, z) {
    if (Math.abs(z) <= L) return Math.abs(x) <= W;
    return Math.hypot(x, Math.abs(z) - L) <= W;
  }

  function pickFloor() {
    // Rejection sample the straight field, then let the rounded ends have their
    // say; a handful of retries settles the corners.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const radius = CRUSH_INNER + Math.random() * (FIELD_OUTER - CRUSH_INNER);
      const angle = Math.random() * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      if (onField(x, z)) return { x, z };
    }
    // Fall back to somewhere certainly legal.
    return { x: 0, z: CRUSH_INNER + Math.random() * 40 };
  }

  const material = createCrowdMaterial({
    color: 0xffe6cf,
    intensity: 1.75,
    bob: 1.3,
    pointScale: 300,
  });

  const crowd = createCrowdPoints({
    count,
    material,
    place: () => {
      const crush = Math.random() < CRUSH_SHARE;
      let floor = pickFloor();
      // Pull the crush in tight around the stage.
      if (crush) {
        const angle = Math.atan2(floor.x, floor.z);
        const radius = CRUSH_INNER + Math.random() * (CRUSH_OUTER - CRUSH_INNER) * Math.random();
        floor = { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
      }
      const rowdy = crush && Math.random() < 0.22 ? 1 : 0;
      return {
        x: floor.x,
        // Standing on the field, which is the floor plane.
        y: CONFIG.globe.yOffset + 1.5 + Math.random() * 1.2,
        z: floor.z,
        // Phones are closer here than up in the stands, so they read bigger.
        size: rowdy ? 1.5 + Math.random() * 1.7 : 0.85 + Math.random() * 1.2,
        rowdy,
      };
    },
  });

  return {
    points: crowd.points,
    update(time, energy = 0) {
      crowd.update(time);
      crowd.setEnergy(energy);
    },
    setPixelRatio(ratio) {
      crowd.setPixelRatio(ratio);
    },
  };
}
