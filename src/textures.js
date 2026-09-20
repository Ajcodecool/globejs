import * as THREE from 'three';

const EARTH_URL = `${import.meta.env.BASE_URL}textures/earth-blue-marble.jpg`;

/**
 * Load the Earth map locally (shipped in /public) and resolve with a
 * procedurally drawn stand-in if the file is missing or decoding fails, so the
 * scene never hangs on a blank sphere.
 *
 * @param {(ratio: number) => void} [onProgress] 0..1 while downloading
 * @param {number} [maxAnisotropy] renderer capability for grazing-angle detail
 * @returns {Promise<{ texture: THREE.Texture, usedFallback: boolean }>}
 */
export async function loadEarthTexture(onProgress, maxAnisotropy = 1) {
  const loader = new THREE.TextureLoader();

  const finish = (texture, usedFallback) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    onProgress?.(1);
    return { texture, usedFallback };
  };

  try {
    const texture = await loader.loadAsync(EARTH_URL, (event) => {
      if (onProgress && event.total) onProgress(Math.min(1, event.loaded / event.total));
    });
    // The blue-marble map is still loading in dev; report full progress anyway.
    return finish(texture, false);
  } catch {
    console.warn('[stage] Earth texture unavailable — drawing a procedural fallback.');
    return finish(createProceduralEarth(), true);
  }
}

/**
 * Paints a passable ocean/continent/ice-cap Earth into a canvas texture.
 * Deliberately cheap: a few hundred soft blobs, no external assets.
 */
export function createProceduralEarth(width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#0a2340');
  ocean.addColorStop(0.5, '#12456f');
  ocean.addColorStop(1, '#0a2340');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  // Continents as overlapping soft landmass blobs.
  for (let i = 0; i < 160; i += 1) {
    const cx = Math.random() * width;
    const cy = height * (0.1 + Math.random() * 0.8);
    const r = 14 + Math.random() * 70;
    const land = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const green = 70 + Math.random() * 60;
    land.addColorStop(0, `rgba(${32 + green * 0.35}, ${70 + green}, 48, 0.55)`);
    land.addColorStop(1, 'rgba(30, 70, 45, 0)');
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Polar caps.
  for (const y of [0, height]) {
    const cap = ctx.createLinearGradient(0, y === 0 ? 0 : height, 0, y === 0 ? height * 0.14 : height * 0.86);
    cap.addColorStop(0, 'rgba(235, 245, 255, 0.92)');
    cap.addColorStop(1, 'rgba(235, 245, 255, 0)');
    ctx.fillStyle = cap;
    ctx.fillRect(0, y === 0 ? 0 : height * 0.86, width, height * 0.14);
  }

  return new THREE.CanvasTexture(canvas);
}
