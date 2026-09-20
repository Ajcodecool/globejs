import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import './style.css';
import { CONFIG, QUALITY, REDUCED_MOTION } from './config.js';
import { loadEarthTexture } from './textures.js';
import { createGlobe, createArtist } from './globe.js';
import { createLights } from './lights.js';
import { createSmoke } from './smoke.js';
import { createStarfield } from './starfield.js';
import { createStadium } from './stadium.js';
import { createMosh } from './mosh.js';
import { createBeams } from './beams.js';
import { createProjector } from './projector.js';
import { createFlares } from './flares.js';
import { createSunset } from './sunset.js';
import { createRig } from './controls.js';
import { createUI } from './ui.js';
import { createBeat } from './beat.js';
import { createPlayer } from './player.js';
import { createCueRunner } from './cues.js';
import { createStrobe } from './strobe.js';
import { createFireworks } from './fireworks.js';
import { createShowFX } from './showfx.js';
import { TRACKS } from './tracks.js';

const canvas = document.getElementById('scene');

/* ------------------------------------------------------------------ *
 * Renderer
 * ------------------------------------------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (error) {
  showFatal(canvas, error);
  throw error;
}

const pixelRatio = Math.min(window.devicePixelRatio, QUALITY.pixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// PCFSoftShadowMap was removed from three.js; PCF + a slightly larger map
// gives the same soft-edged stage shadow.
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

/* ------------------------------------------------------------------ *
 * Scene graph
 * ------------------------------------------------------------------ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// Deep fog swallows the base of the sphere and the far edge of the floor.
scene.fog = new THREE.FogExp2(0x000000, CONFIG.fogDensity);

const camera = new THREE.PerspectiveCamera(
  CONFIG.camera.fov,
  window.innerWidth / window.innerHeight,
  CONFIG.camera.near,
  CONFIG.camera.far,
);
camera.position.set(CONFIG.camera.start.x, CONFIG.camera.start.y, CONFIG.camera.start.z);

/** Everything the cursor parallax is allowed to tilt. */
const parallaxGroup = new THREE.Group();
scene.add(parallaxGroup);

// Black floor: cuts off the underside of the sphere so it rises from mist.
// It tilts with the stage rig, so the audience line moves with the parallax.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = CONFIG.globe.yOffset + CONFIG.stage.floorOffset;
parallaxGroup.add(floor);

const stars = createStarfield(QUALITY.stars);
scene.add(stars.points);

// Dusk sits behind the stadium: the show opens at 8:58 PM, with the warm sun
// still above the horizon and the bowl becoming a night silhouette over time.
const sunset = createSunset();
scene.background = sunset.background;
scene.add(sunset.group);

// The stadium is the backdrop: it sits outside the parallax rig so the bowl
// stays put while the stage breathes.
const stadium = createStadium();
scene.add(stadium.group);

const projector = createProjector();
scene.add(projector.group);

// Red flares sit on a clean ring around the globe and wait for KING's 18.5s cue.
const flares = createFlares();
parallaxGroup.add(flares.group);

// Fireworks go up over the stadium, so they live in world space rather than
// tilting with the stage rig.
const fireworks = createFireworks();
scene.add(fireworks.points);

// Stronger's production effects: X beams, red flash, red pyro, golden fountains.
const showfx = createShowFX();
scene.add(showfx.group);

const artist = createArtist();
parallaxGroup.add(artist.group);

const lights = createLights(artist.focus);
scene.add(
  lights.ambient,
  lights.bounce,
  lights.wash,
  lights.rim,
  lights.key,
  lights.keyTarget,
);

// The floor crowd stands on the field, so it tilts with the stage rig.
const mosh = createMosh();
parallaxGroup.add(mosh.points);

const smoke = createSmoke(QUALITY.smoke);
parallaxGroup.add(smoke.points);

const beams = createBeams();
parallaxGroup.add(beams.group);

/**
 * The camera orbits a point above the performer rather than the performer
 * themself: that drops the globe into the lower half of the frame, so only its
 * upper half reads and the sky is left open for the beams.
 */
const framing = artist.focus.clone();
framing.y += CONFIG.camera.targetLift;

const rig = createRig({
  camera,
  domElement: canvas,
  focus: framing,
  parallaxGroup,
});

/* ------------------------------------------------------------------ *
 * Post-processing
 * ------------------------------------------------------------------ */
const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.bloom.strength,
  CONFIG.bloom.radius,
  CONFIG.bloom.threshold,
);
composer.addPass(bloomPass);

// The strobe sits last but one, so it whites out the rendered frame — bloom
// included — without touching the chrome on top of the canvas.
const strobe = createStrobe();
composer.addPass(strobe.pass);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ *
 * State + UI
 * ------------------------------------------------------------------ */
const state = {
  autoRotate: !REDUCED_MOTION,
  spin: !REDUCED_MOTION,
  parallax: !REDUCED_MOTION,
  beams: true,
  flares: true,
  crowd: true,
  mosh: true,
  projector: true,
  stadium: true,
  smoke: true,
  stars: true,
  bloom: true,
  paused: false,
  spinSpeed: CONFIG.globe.spinSpeed,
  bloomStrength: CONFIG.bloom.strength,
};

let globe = null;

/* ------------------------------------------------------------------ *
 * The show: per-song choreography
 * ------------------------------------------------------------------ */

/**
 * Song-level state, driven entirely by the cues a track declares.
 *
 * `dark` is the blackout a song can open in — the planet is dead until a cue
 * relights it, and `spin` is the multiplier a cue can leave behind (KING's
 * flares spin the Earth faster for the rest of the set).
 */
let cues = createCueRunner([]);
let dark = 0;
/** Whether this song's blackout has been lifted yet. */
let relit = true;
let spin = 1;
/** Grey level the song opened with, and where the lights-up fade is heading. */
let grey = 0;
/** Grey level the song *opened* with, so the lights-up fade can drain it. */
let openingGrey = 0;
let lightsFadeRemaining = 0;
let lightsFadeDuration = 1;
let lightsFadeFrom = 1;
/** Absolute light level a song can open at, faded up from by `lightsUp`. */
let dimLevel = 1;
/** Base spin a cue leaves behind, in rad/s — `spin` multiplies it. */
let baseSpin = CONFIG.globe.spinSpeed;

/**
 * Called from the player whenever the track changes: clear every effect, then
 * arm that song's own cue sheet.
 */
function beginTrack(track) {
  flares.reset();
  fireworks.reset();
  strobe.reset();
  showfx.reset();
  spin = 1;
  baseSpin = CONFIG.globe.spinSpeed;
  dark = track?.opening?.dark ? 1 : 0;
  grey = track?.opening?.grey ? 1 : 0;
  openingGrey = grey;
  dimLevel = track?.opening?.dim ?? 1;
  lightsFadeRemaining = 0;
  relit = dark === 0;
  cues = createCueRunner(track?.cues ?? []);
}

/** @param {object} cue one entry from the song's cue sheet */
function fireCue(cue) {
  switch (cue.effect) {
    case 'flares':
      flares.trigger();
      if (cue.spin) spin = cue.spin;
      break;
    case 'strobe':
      strobe.trigger(cue.duration ?? 3);
      if (cue.relight) relit = true;
      break;
    case 'fireworks':
      fireworks.trigger({ color: cue.color, shells: cue.shells });
      break;
    case 'lightsUp':
      // Fade the house lights up — and the planet's grey out — together.
      lightsFadeDuration = Math.max(0.001, cue.fade ?? 4);
      lightsFadeRemaining = lightsFadeDuration;
      lightsFadeFrom = dimLevel;
      relit = true;
      break;
    case 'xBeams':
      showfx.xBeams();
      break;
    case 'xBeamsEnd':
      showfx.xBeamsEnd();
      break;
    case 'redFlash':
      showfx.triggerRedFlash(CONFIG.showfx.redFlash.decay);
      break;
    case 'redPyro':
      showfx.triggerRedPyro();
      break;
    case 'goldenFountains':
      showfx.triggerGoldenFountains(CONFIG.showfx.fountain.seconds);
      break;
    case 'spin':
      baseSpin = cue.speed ?? CONFIG.globe.spinSpeed;
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Music
 * ------------------------------------------------------------------ */
const player = createPlayer({ tracks: TRACKS, volume: 0.8, onTrackChange: beginTrack });
const beat = createBeat();

const ui = createUI({
  state,
  onChange: applySetting,
  onReset: () => rig.reset(),
  onToggleAudio: () => player.toggle(),
  onToggleMute: () => document.getElementById('player-mute')?.click(),
});

function applySpin() {
  // The slider is the base speed unless a song's `spin` cue has claimed it;
  // the frame loop applies `baseSpin * spin` every frame.
  baseSpin = state.spinSpeed;
}

function applySetting(key, value) {
  switch (key) {
    case 'autoRotate':
      rig.setAutoRotate(value);
      break;
    case 'parallax':
      rig.setParallax(value);
      break;
    case 'spin':
    case 'spinSpeed':
      applySpin();
      break;
    case 'bloom':
      bloomPass.enabled = value;
      break;
    case 'bloomStrength':
      bloomPass.strength = value;
      break;
    case 'beams':
      beams.group.visible = value;
      break;
    case 'crowd':
      stadium.setAudienceVisible(value);
      break;
    case 'mosh':
      mosh.points.visible = value;
      break;
    case 'projector':
      projector.setBeamVisible(value);
      projector.setProjectionVisible(value);
      break;
    case 'flares':
      flares.group.visible = value;
      break;
    case 'stadium':
      stadium.setVisible(value);
      break;
    case 'smoke':
      smoke.points.visible = value;
      break;
    case 'stars':
      stars.points.visible = value;
      break;
    default:
      break;
  }
}

rig.setAutoRotate(state.autoRotate);
rig.setParallax(state.parallax);

/* ------------------------------------------------------------------ *
 * Asset load (local texture, with procedural fallback)
 * ------------------------------------------------------------------ */
let progress = 0.06;
ui.setProgress(progress);
const ramp = setInterval(() => {
  progress = Math.min(progress + Math.random() * 0.07, 0.86);
  ui.setProgress(progress);
}, 200);

loadEarthTexture(undefined, renderer.capabilities.getMaxAnisotropy()).then(({ texture, usedFallback }) => {
  globe = createGlobe(texture, projector.uniform);
  parallaxGroup.add(globe.group);
  applySpin();
  if (window.__stage) window.__stage.globe = globe;

  ui.setNote(usedFallback ? 'drawing procedural earth' : 'earth map ready');
  ui.setStatus(usedFallback ? 'procedural earth • three.js' : 'offline texture • three.js');
  ui.setProgress(1);
  clearInterval(ramp);

  // Give the bar a beat to finish before the veil lifts.
  setTimeout(() => ui.dismissLoader(), 420);
});

// Safety net: never leave the veil up if the texture stalls.
setTimeout(() => {
  if (document.getElementById('loader')?.classList.contains('is-done')) return;
  clearInterval(ramp);
  ui.setProgress(1);
  ui.dismissLoader();
}, 8000);

/* ------------------------------------------------------------------ *
 * Loop
 * ------------------------------------------------------------------ */
let time = 0;
let last = performance.now();
let frames = 0;
let fpsWindow = last;

const frameInterval = 1000 / CONFIG.render.maxFps;

function frame(now) {
  requestAnimationFrame(frame);

  if (document.hidden) {
    last = now;
    return;
  }

  // Throttle to a sane frame rate. Without this the loop can spin hundreds of
  // times a second wherever rAF is not vsync-locked, which saturates the main
  // thread and leaves the page visibly stuck on a black surface.
  if (now - last < frameInterval - 0.5) return;

  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  // The show clock is a wall clock: it keeps running even if the stage is
  // paused, because 9:00 PM is 9:00 PM.
  sunset.update(dt);

  // Music keeps playing while the scene is paused; the stage just stops moving.
  const pulse = beat.update(dt, time, player.sampleEnergy());

  if (!state.paused) {
    time += dt;
    // Pre-show: the stage is held back until the 9:00 PM downbeat, which is the
    // one moment of the timeline the lighting itself announces.
    const showGain = sunset.isPreShow ? CONFIG.timeline.preShowGain : 1;

    // Whatever this song's cues have just crossed. Latching, seeking and
    // firing from a restored position all live in the runner.
    const trackTime = player.audio.currentTime;
    for (const cue of cues.update(trackTime)) fireCue(cue);

    // A blackout holds until a cue lifts it, then leaves fast: it is the strobe
    // that reveals the planet, not a slow fade.
    if (relit && dark > 0) dark = Math.max(0, dark - dt * 4);
    const illumination = 1 - dark;

    // A lights-up cue fades the house from the song's dim level to full, and
    // drains the opening grey along the same ramp, so colour returns with the
    // light rather than on a separate clock.
    if (lightsFadeRemaining > 0) {
      lightsFadeRemaining = Math.max(0, lightsFadeRemaining - dt);
      const t = 1 - lightsFadeRemaining / lightsFadeDuration;
      dimLevel = lightsFadeFrom + (1 - lightsFadeFrom) * t;
      grey = openingGrey * (1 - t);
    }
    const stageGain = showGain * illumination * dimLevel;

    // The planet's own light: dark multiplies to black, grey drains to luma.
    if (globe) {
      globe.setIllumination(illumination);
      globe.setGrey(grey);
    }

    flares.update(dt, pulse);
    fireworks.update(dt);
    showfx.update(dt);

    // A cue can leave a new base spin behind (rad/s), scaled by any multiplier.
    if (globe) {
      globe.setSpinSpeed(state.spin ? baseSpin * spin : 0);
      globe.update(dt);
    }
    artist.update(time);
    mosh.update(time, pulse);
    smoke.update(dt, time);
    stadium.update(time);
    projector.update(dt, time, pulse, stageGain);
    beams.update(time, pulse, stageGain);
    lights.update(time, pulse, stageGain);
  }

  // The strobe is a post pass, so it has to be advanced whether or not the
  // stage is paused — it is the room flashing, not the stage moving.
  strobe.update(dt);

  // Stars come out with the dark, and drift whether or not the stage is paused.
  // At 8:58 the sky is still bright enough that they should be nearly absent.
  stars.update(dt);
  stars.setOpacity(0.04 + 0.8 * sunset.night);

  rig.update(dt);

  // Always through the composer: the strobe is a pass, and bypassing the chain
  // for a clean render would quietly disable it.
  composer.render();

  const clockTime = document.getElementById('show-clock-time');
  const clockStatus = document.getElementById('show-clock-status');
  if (clockTime) clockTime.textContent = sunset.clockLabel;
  if (clockStatus) {
    clockStatus.textContent = sunset.isPreShow
      ? 'SUNSET · CONCERT AT 9:00 PM'
      : sunset.isNightShow
        ? 'NIGHT SHOW · SUNSET ENDED 9:10 PM'
        : 'CONCERT LIVE · SUNSET ENDS 9:10 PM';
  }

  frames += 1;
  if (now - fpsWindow >= 500) {
    ui.setFps((frames * 1000) / (now - fpsWindow));
    frames = 0;
    fpsWindow = now;
  }
}

requestAnimationFrame(frame);

/* ------------------------------------------------------------------ *
 * Resize / visibility
 * ------------------------------------------------------------------ */
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio, QUALITY.pixelRatio);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height);
  composer.setPixelRatio(ratio);
  composer.setSize(width, height);
  stadium.setPixelRatio(ratio);
  mosh.setPixelRatio(ratio);
  fireworks.setPixelRatio(ratio);
});

document.addEventListener('visibilitychange', () => {
  // Don't let a hidden tab produce a huge delta on return.
  last = performance.now();
});

// Debug handle: poke at the scene from the browser console
// (window.__stage.state.smoke = false, etc.) or from automated checks.
window.__stage = {
  renderer,
  scene,
  camera,
  composer,
  bloomPass,
  rig,
  state,
  ui,
  player,
  beat,
  lights,
  beams,
  stadium,
  projector,
  flares,
  sunset,
  mosh,
  strobe,
  fireworks,
  showfx,
  get cues() {
    return cues;
  },
  get showState() {
    return { dark, relit, spin, grey, dimLevel, baseSpin, illumination: 1 - dark };
  },
};

/** Last-resort message when WebGL cannot start at all. */
function showFatal(element, error) {
  const container = document.getElementById('fatal');
  if (container) {
    container.hidden = false;
    container.innerHTML =
      '<strong>WebGL is unavailable</strong>' +
      '<span>This simulation needs a WebGL-capable browser.</span>';
  }
  document.getElementById('loader')?.remove();
  console.error('[stage] renderer failed to start', error, element);
}
