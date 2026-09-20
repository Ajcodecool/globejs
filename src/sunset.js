import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * The show's fixed local timeline: it opens at 8:58 PM with the sun still
 * setting, the sun is barely a sliver by the time the concert starts at 9:00 PM,
 * and the sunset officially ends at 9:10 PM — from there the rest of the show
 * plays under a fully night sky.
 *
 * The clock advances in real time from page load, so the twelve-minute sunset
 * is watchable rather than instant.
 */
export function createSunset() {
  const { startHour, startMinute, concertStartSeconds, sunsetEndSeconds } = CONFIG.timeline;

  const group = new THREE.Group();

  // Fallback colour behind everything: the dusk is still visible wherever the
  // stadium bowl does not fill the frame.
  const background = new THREE.Color(0x17172d);
  const nightBackground = new THREE.Color(0x010208);

  const uniforms = {
    uWarmth: { value: 1 },
    uNight: { value: 0.12 },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        uniform float uWarmth;
        uniform float uNight;
        void main() {
          vec3 dir = normalize(vWorld);
          // Afterglow is strongest at the horizon and falls away gradually. A
          // narrow band would draw a hard line where the stands cut the sky.
          float band = exp(-max(dir.y, 0.0) * 1.45);
          float lowGlow = smoothstep(-0.22, 0.04, dir.y) * (1.0 - smoothstep(0.05, 0.85, dir.y));

          vec3 deepNight = vec3(0.004, 0.007, 0.019);
          vec3 violet = vec3(0.075, 0.045, 0.14);
          vec3 amber = vec3(0.62, 0.24, 0.07);

          vec3 sky = deepNight;
          sky += violet * (1.0 - uNight) * 0.85;
          sky += amber * band * uWarmth;
          sky += amber * lowGlow * uWarmth * 0.7;
          // Even at full night a trace of city/haze glow stays at the horizon.
          sky += vec3(0.05, 0.035, 0.05) * band * (1.0 - uNight * 0.55);

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    }),
  );
  group.add(dome);

  // The sun sits just above the far stand line, so the bowl frames it instead
  // of hiding it, and sinks a little as it goes.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createSunTexture(),
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  }));
  const sunBaseY = 350;
  sun.position.set(-330, sunBaseY, -560);
  sun.scale.set(112, 112, 1);
  group.add(sun);

  let showSeconds = 0;
  let visibility = 0.62;
  let night = 0.12;

  const apply = () => {
    // How much of the disc is still above the horizon.
    visibility = keyframes(
      [
        [0, 0.62],
        [60, 0.32],
        [concertStartSeconds, 0.13], // barely visible as the concert begins
        [420, 0.05],
        [sunsetEndSeconds, 0], // sunset officially over
      ],
      showSeconds,
    );

    // Warmth of the sky, and how far the light has collapsed into night.
    const warmth = keyframes(
      [
        [0, 1],
        [concertStartSeconds, 0.5],
        [360, 0.18],
        [sunsetEndSeconds, 0.05],
      ],
      showSeconds,
    );

    night = keyframes(
      [
        [0, 0.12],
        [concertStartSeconds, 0.45],
        [420, 0.75],
        [sunsetEndSeconds, 1],
      ],
      showSeconds,
    );

    uniforms.uWarmth.value = warmth;
    uniforms.uNight.value = night;
    background.lerpColors(new THREE.Color(0x1c1a30), nightBackground, night);

    // The disc dims and shrinks as it slips behind the stands.
    const sunScale = 112 * (0.45 + visibility);
    sun.scale.set(sunScale, sunScale, 1);
    sun.material.opacity = visibility * 1.15;
    sun.position.y = sunBaseY - (1 - visibility) * 52;
  };

  apply();

  return {
    group,
    background,

    get showSeconds() {
      return showSeconds;
    },
    get sunVisibility() {
      return visibility;
    },
    get night() {
      return night;
    },
    /** True until the 9:00 PM concert start. */
    get isPreShow() {
      return showSeconds < concertStartSeconds;
    },
    /** True once the 9:10 PM sunset has officially ended. */
    get isNightShow() {
      return showSeconds >= sunsetEndSeconds;
    },

    /** "8:58:12 PM" for the on-screen show clock. */
    get clockLabel() {
      const total = startHour * 3600 + startMinute * 60 + Math.floor(showSeconds);
      const hours = Math.floor(total / 3600) % 24;
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      const suffix = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 === 0 ? 12 : hours % 12;
      return `${hour12}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${suffix}`;
    },

    /**
     * Jump the show clock — used for scrubbing and for verifying the timeline
     * without waiting twelve real minutes.
     */
    setShowSeconds(value) {
      showSeconds = value;
      apply();
    },

    /** @param {number} dt seconds since the last frame */
    update(dt) {
      showSeconds += dt;
      apply();
    },
  };
}

/**
 * Piecewise-linear lookup over [seconds, value] pairs, clamped at both ends.
 * The timeline is a set of story beats rather than a formula, so it reads
 * better as explicit keyframes.
 */
function keyframes(points, at) {
  if (at <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [t1, v1] = points[i];
    const [t0, v0] = points[i - 1];
    if (at <= t1) {
      const t = (at - t0) / (t1 - t0 || 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return points[points.length - 1][1];
}

function createSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,248,205,1)');
  gradient.addColorStop(0.18, 'rgba(255,184,83,0.95)');
  gradient.addColorStop(0.5, 'rgba(255,92,36,0.25)');
  gradient.addColorStop(1, 'rgba(255,50,10,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}
