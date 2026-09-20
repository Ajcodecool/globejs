import * as THREE from 'three';
import { CONFIG, QUALITY } from './config.js';
import { createCrowdMaterial, createCrowdPoints } from './crowd.js';

/**
 * Raymond James Stadium, reduced to what reads at night from the middle of the
 * field.
 *
 * The real building is a racetrack, not a bowl: long straight sidelines with
 * the end zones rounded into semicircles. That plan is what earns it two 680 ft
 * LED ribbons running the length of the east and west fascias, and two 60x160 ft
 * end-zone boards. So the geometry here is built the same way — a closed plan
 * path with straight sides and rounded ends — and the seating *section* is
 * lofted around it. Buccaneers Cove is then cut out of the north end for the
 * pirate ship, which is what breaks the otherwise continuous bowl.
 *
 * Everything out here is dark and opts out of the scene fog: at 400+ units the
 * exponential fog would erase the stands completely, and as the backdrop it
 * must never out-shout the stage.
 *
 * Sizes follow the real stadium at roughly 1 unit = 0.8 ft, so a feature's
 * proportions survive even though the whole thing is stylised.
 */

const FIELD_Y = CONFIG.globe.yOffset;

/**
 * Section through the bowl, front row upward: [outward offset, height above the
 * field, tone]. Deliberately a stepped polyline rather than a curve — the steps
 * are the tier fascias, and the tones are what make the tiers read at distance.
 */
const BOWL_PROFILE = [
  // lower bowl, ~30 degrees of rake
  [0, 0, 'seat'],
  [13, 8, 'seat'],
  [26, 16, 'seat'],
  [39, 24, 'seat'],
  [52, 31, 'seat'],
  [65, 39, 'seat'],
  [78, 47, 'seat'],
  [88, 55, 'seat'],
  // club facade: a vertical band, and where the sideline ribbon hangs
  [88, 74, 'wall'],
  // club level, set back behind the lounges
  [98, 80, 'club'],
  [112, 86, 'club'],
  [128, 92, 'club'],
  [140, 96, 'club'],
  // fascia between the club and the upper deck
  [140, 112, 'wall'],
  // upper deck, steeper — RJS is known for one
  [160, 126, 'seat'],
  [182, 143, 'seat'],
  [204, 160, 'seat'],
  [226, 177, 'seat'],
  [248, 194, 'seat'],
  [264, 206, 'seat'],
  // back wall, capped with a lit fascia lip: from the field this bright lip is
  // what draws the rim of the bowl against the sky.
  [264, 216, 'wall'],
  [266, 221, 'trim'],
  [266, 224, 'trim'],
];

/** Canopy shell riding over the upper deck. */
const CANOPY_PROFILE = [
  [244, 198],
  [296, 224],
  [330, 228],
  [338, 212],
];

/**
 * Buccaneers Cove: the deck standing in the notch cut out of the north end.
 * Without it the cove is simply a hole in the bowl — a large part of the
 * stadium with nothing in it. With it, the notch reads as a raised plaza, the
 * ship has somewhere to sit, and the sky stays open above.
 */
const COVE_PROFILE = [
  [2, -15, 'wall'],
  [2, 44, 'club'],
  [96, 50, 'club'],
  [112, 74, 'wall'],
];

const TONES = {
  seat: new THREE.Color(0x0e141f),
  club: new THREE.Color(0x172232),
  wall: new THREE.Color(0x22304a),
  roof: new THREE.Color(0x141c28),
  trim: new THREE.Color(0x55708f),
};

/** The club facade, where the ribbon sits. Matches BOWL_PROFILE. */
const CLUB_FASCIA = { offset: 88, rise: 66 };

export function createStadium() {
  const group = new THREE.Group();
  const { segments, towerCount, screenText, halfWidth } = CONFIG.stadium;
  const plan = createPlan();
  const step = plan.total / segments;

  /* ---------------- seating bowl ---------------- */

  // The ring minus the cove is a single open span: the section simply stops at
  // the cove edges, leaving the notch the ship sits in.
  const coveStart = plan.coveStart;
  const coveEnd = plan.coveEnd;
  const bowlSamples = plan.sampleRange(coveEnd, coveStart + plan.total, step);
  group.add(buildLoft(bowlSamples, BOWL_PROFILE, TONES));

  // Fill the cove with its deck, and light the lip so the notch reads as a
  // feature rather than a gap.
  const coveSamples = plan.sampleRange(coveStart, coveEnd, step * 0.6);
  group.add(buildLoft(coveSamples, COVE_PROFILE, TONES));
  const coveLights = createCoveLights(coveSamples);
  group.add(coveLights.points);

  /* ---------------- upper-deck canopy ---------------- */
  // Real canopy covers the sidelines only, which also leaves the end zones
  // open above the video boards.
  for (const [from, to] of [
    [-plan.straight * 0.06, plan.straight * 1.06],
    [plan.straight + plan.arc - plan.straight * 0.06, plan.straight * 2 + plan.arc + plan.straight * 0.06],
  ]) {
    group.add(buildLoft(plan.sampleRange(from, to, step * 1.6), CANOPY_PROFILE, TONES));
  }

  /* ---------------- corner floodlight masts ---------------- */

  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0x161d29,
    roughness: 0.6,
    metalness: 0.5,
    fog: false,
  });
  // Kept inside the bloom threshold on purpose: a hotter emissive turns the
  // bank into a formless white blob.
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xdbe6ff,
    emissive: 0xb9cdf2,
    emissiveIntensity: 1.5,
    roughness: 0.4,
    fog: false,
  });
  const mastHeight = 110;
  const masts = new THREE.Group();

  for (let i = 0; i < towerCount; i += 1) {
    const corner = plan.corner(i);
    const radius = 330;
    const x = corner.x + corner.nx * radius;
    const z = corner.z + corner.nz * radius;

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.5, mastHeight, 8), mastMaterial);
    mast.position.set(x, FIELD_Y + 214 + mastHeight / 2, z);
    masts.add(mast);

    const bank = new THREE.Group();
    bank.position.set(x, FIELD_Y + 214 + mastHeight, z);
    bank.lookAt(0, FIELD_Y, 0);

    bank.add(new THREE.Mesh(new THREE.BoxGeometry(26, 2, 2), mastMaterial));
    for (let l = -2; l <= 2; l += 1) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5.4, 2.4), lampMaterial);
      lamp.position.set(l * 5.2, 4.2, 0);
      bank.add(lamp);
    }
    masts.add(bank);
  }
  group.add(masts);

  /* ---------------- sideline LED ribbons ---------------- */
  // Two continuous ribbons, one per sideline, hung on the club facade and
  // running the length of the straight. This is the stadium's signature line.
  const ribbons = [];
  const ribbonLength = plan.straight;
  const ribbonHeight = 8;
  const ribbonY = FIELD_Y + CLUB_FASCIA.rise;
  const ribbonX = halfWidth + CLUB_FASCIA.offset + 0.4;

  for (const side of [-1, 1]) {
    const texture = createRibbonTexture(screenText);
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(ribbonLength, ribbonHeight),
      new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        fog: false,
        side: THREE.DoubleSide,
      }),
    );
    // Face the field: the plane's normal has to point back across it.
    ribbon.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    ribbon.position.set(side * ribbonX, ribbonY, 0);
    ribbons.push(texture);
    group.add(ribbon);
  }

  /* ---------------- end-zone video boards ---------------- */
  // 60 ft tall by 160 ft wide — the largest in the league, and the reason the
  // north end reads as a stadium from the stage.
  const screens = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b2331,
    roughness: 0.6,
    metalness: 0.4,
    fog: false,
  });
  const boardMaterial = new THREE.MeshBasicMaterial({
    map: createScreenTexture(screenText, 8 / 3),
    toneMapped: false,
    fog: false,
  });
  const boardWidth = 160;
  const boardHeight = 60;

  for (const side of [-1, 1]) {
    const stand = new THREE.Group();
    const z = side * (plan.L + plan.R + 190);
    // Hung above the top of the end stand, so it towers over the far rim the
    // way the real boards do. `lookAt` already tips the panel down toward the
    // field; do NOT rotate it further, or the board turns edge-on.
    stand.position.set(0, FIELD_Y + 230, z);
    stand.lookAt(0, FIELD_Y, 0);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(boardWidth + 8, boardHeight + 8, 5), frameMaterial);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth, boardHeight), boardMaterial);
    panel.position.z = 3;
    stand.add(frame, panel);

    // The board is carried on the back of the end stand, which reads from
    // every angle the stage is ever seen from — so no legs hanging in the air.
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth * 0.98, boardHeight * 0.9, 10),
      frameMaterial,
    );
    backing.position.z = -8;
    stand.add(backing);

    screens.add(stand);
  }
  group.add(screens);

  /* ---------------- corner video towers ---------------- */
  // Four vertical HD walls, 61 ft tall by 43 ft wide, anchored in the corners.
  const cornerMaterial = new THREE.MeshBasicMaterial({
    map: createScreenTexture(screenText, 43 / 61),
    toneMapped: false,
    fog: false,
  });
  const towerWidth = 43;
  const towerHeight = 61;

  for (let i = 0; i < CONFIG.stadium.videoTowers; i += 1) {
    const corner = plan.corner(i);
    const tower = new THREE.Group();
    tower.position.set(
      corner.x + corner.nx * 250,
      FIELD_Y + 230,
      corner.z + corner.nz * 250,
    );
    tower.lookAt(0, FIELD_Y + 90, 0);

    tower.add(new THREE.Mesh(new THREE.BoxGeometry(towerWidth + 5, towerHeight + 5, 4), frameMaterial));
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(towerWidth, towerHeight), cornerMaterial);
    wall.position.z = 2.6;
    tower.add(wall);
    group.add(tower);
  }

  /* ---------------- the pirate ship, Buccaneers Cove ---------------- */
  const ship = createPirateShip();
  const coveMid = plan.at((coveStart + coveEnd) / 2);
  // The cove's deck is at the top of the lower bowl, as the real one is, which
  // is also the only height at which the rig clears the stage in front of it.
  // Nudged a little west of dead centre so it reads beside the video board
  // rather than tangled with it.
  ship.position.set(coveMid.x - 60, FIELD_Y + 50, coveMid.z - 40);
  // Turned broad on, bow angled out over the end zone. Head-on the three
  // masts collapse into one line; across the view they read as a ship.
  ship.rotation.y = -0.9;
  ship.scale.setScalar(1.1);
  group.add(ship);

  /* ---------------- audience ---------------- */

  const audience = createAudience(QUALITY.stadiumAudience, bowlSamples);
  group.add(audience.points);

  return {
    group,
    points: audience.points,

    update(time) {
      audience.update(time);
      coveLights.material.uniforms.uTime.value = time;
      for (const texture of ribbons) {
        // A ribbon scrolls: LED fascia boards are never static.
        texture.offset.x = (time * 0.03) % 1;
      }
    },

    setPixelRatio(ratio) {
      audience.setPixelRatio(ratio);
    },

    setVisible(visible) {
      group.visible = visible;
    },

    setAudienceVisible(visible) {
      audience.points.visible = visible;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Plan: the racetrack path
 * ------------------------------------------------------------------ */

/**
 * The bowl's plan as a closed path: two straights at x = ±halfWidth, with the
 * end zones rounded into semicircles of the same radius, so the shape is a
 * racetrack and every straight is exactly 2 * straightHalfLength long — which is
 * what the 680 ft sideline ribbons run along.
 *
 * Arc length is the parameter everywhere, which keeps the loft and the audience
 * evenly spaced regardless of whether a sample lands on a straight or a curve.
 */
function createPlan() {
  const { halfWidth: W, straightHalfLength: L, coveHalfAngle } = CONFIG.stadium;
  const R = W;
  const straight = 2 * L;
  const arc = Math.PI * R;
  const total = 2 * straight + 2 * arc;
  const northStart = 2 * straight + arc;

  // Buccaneers Cove: a wedge out of the north end for the ship.
  const coveAngle = THREE.MathUtils.degToRad(coveHalfAngle);
  const coveStart = northStart + (Math.PI / 2 - coveAngle) * R;
  const coveEnd = northStart + (Math.PI / 2 + coveAngle) * R;

  /** Position and outward normal at arc length `s`. */
  function at(s) {
    const t = ((s % total) + total) % total;
    if (t < straight) {
      return { x: W, z: -L + t, nx: 1, nz: 0 };
    }
    if (t < straight + arc) {
      const theta = (t - straight) / R;
      return {
        x: R * Math.cos(theta),
        z: L + R * Math.sin(theta),
        nx: Math.cos(theta),
        nz: Math.sin(theta),
      };
    }
    if (t < northStart) {
      return { x: -W, z: L - (t - straight - arc), nx: -1, nz: 0 };
    }
    const theta = Math.PI + (t - northStart) / R;
    return {
      x: R * Math.cos(theta),
      z: -L + R * Math.sin(theta),
      nx: Math.cos(theta),
      nz: Math.sin(theta),
    };
  }

  function sampleRange(from, to, step) {
    const count = Math.max(2, Math.round((to - from) / step));
    const out = [];
    for (let i = 0; i <= count; i += 1) out.push(at(from + ((to - from) * i) / count));
    return out;
  }

  /**
   * The four plan corners, in order, each with the outward normal at its
   * midpoint — where the corner towers and floodlights belong.
   */
  function corner(index) {
    const theta = Math.PI / 4 + (index * Math.PI) / 2;
    const south = index % 2 === 0;
    const centre = south ? L : -L;
    return {
      x: R * Math.cos(theta),
      z: centre + R * Math.sin(theta),
      nx: Math.cos(theta),
      nz: Math.sin(theta),
    };
  }

  return { at, sampleRange, corner, total, straight, arc, R, L, coveStart, coveEnd };
}

/* ------------------------------------------------------------------ *
 * Bowl + canopy
 * ------------------------------------------------------------------ */

/**
 * Loft the section around a span of the plan. One mesh holds the whole sweep of
 * seating, and the per-vertex tones are what separate the tiers.
 */
function buildLoft(samples, profile, tones) {
  const rows = profile.length;
  const cols = samples.length;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const indices = [];

  for (let i = 0; i < cols; i += 1) {
    const { x, z, nx, nz } = samples[i];
    for (let j = 0; j < rows; j += 1) {
      const [offset, rise, tone] = profile[j];
      const k = (i * rows + j) * 3;
      positions[k] = x + nx * offset;
      positions[k + 1] = FIELD_Y + rise;
      positions[k + 2] = z + nz * offset;

      const color = tones[tone] ?? tones.seat;
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
    }
  }

  for (let i = 0; i < cols - 1; i += 1) {
    for (let j = 0; j < rows - 1; j += 1) {
      const a = i * rows + j;
      const b = (i + 1) * rows + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.05,
      emissive: 0x0b111c,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Audience
 * ------------------------------------------------------------------ */

/**
 * Audience lights: phone flashes and seat-back LEDs scattered across the bowl.
 * Points are sampled on the same section the bowl is lofted from, so they sit
 * *on* the seating rather than floating in the air, and the cove is skipped
 * because the ship's deck is standing in it.
 */
function createAudience(count, samples) {
  // Sample the section by band length, not by area. Area weighting would crowd
  // the seats up in the upper deck, but from a low camera near the field it is
  // the lower bowl that fills the frame — so that is where the people should
  // be thickest.
  const bands = [];
  let total = 0;
  for (let i = 0; i < BOWL_PROFILE.length - 1; i += 1) {
    const [o0, y0] = BOWL_PROFILE[i];
    const [o1, y1] = BOWL_PROFILE[i + 1];
    const length = Math.hypot(o1 - o0, y1 - y0);
    bands.push({ o0, y0, o1, y1, length });
    total += length;
  }

  const pick = (value) => {
    let target = value * total;
    for (const band of bands) {
      if (target <= band.length) {
        const t = target / band.length;
        return {
          offset: band.o0 + (band.o1 - band.o0) * t,
          rise: band.y0 + (band.y1 - band.y0) * t,
        };
      }
      target -= band.length;
    }
    return { offset: 140, rise: 90 };
  };

  return createCrowdPoints({
    count,
    material: createCrowdMaterial({ color: 0xcfe0ff, intensity: 2.05, bob: 0.9 }),
    place: () => {
      const { offset, rise } = pick(Math.random());
      // Keep the sideways jitter small and the lift generous. The rake rises up
      // to 0.78 per unit of offset, so a wide jitter with a small lift buries
      // half the crowd inside the concrete.
      const jitter = (Math.random() - 0.5) * 3;
      const sample = samples[Math.floor(Math.random() * samples.length)];
      const r = offset + jitter;
      return {
        x: sample.x + sample.nx * r,
        y: FIELD_Y + rise + 2.6 + Math.random() * 1.8,
        z: sample.z + sample.nz * r,
        // Only a fraction are holding their phone up at any moment. Sized for a
        // bowl this far from the camera: anything smaller renders sub-pixel.
        size: Math.random() < 0.32 ? 2.4 + Math.random() * 3.0 : 1.15 + Math.random() * 1.25,
      };
    },
  });
}

/**
 * A lit strip along the lip of the cove deck, so the north end reads as a
 * place rather than a gap from the stage.
 */
function createCoveLights(samples) {
  const positions = new Float32Array(samples.length * 3);
  const phases = new Float32Array(samples.length);
  const sizes = new Float32Array(samples.length);
  const rowdy = new Float32Array(samples.length);

  samples.forEach((sample, i) => {
    const offset = 8;
    positions[i * 3] = sample.x + sample.nx * offset;
    positions[i * 3 + 1] = FIELD_Y + 42;
    positions[i * 3 + 2] = sample.z + sample.nz * offset;
    phases[i] = Math.random();
    sizes[i] = 1.6 + Math.random() * 1.2;
    rowdy[i] = 0;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aRowdy', new THREE.BufferAttribute(rowdy, 1));

  const material = createCrowdMaterial({ color: 0xffd9a0, intensity: 1.5, bob: 0.3, pointScale: 320 });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}

/* ------------------------------------------------------------------ *
 * The pirate ship
 * ------------------------------------------------------------------ */

/**
 * The Bucs' pirate ship: the 103 ft replica in Buccaneers Cove. A low-poly
 * silhouette — hull, three masts with yards and sails, a crow's nest, and lit
 * cannon ports — because that is all that survives the distance and the haze.
 *
 * The rigging is deliberately tall: the ship's hull sits behind the stage, so
 * the masts are what actually break the skyline above it.
 */
function createPirateShip() {
  const ship = new THREE.Group();

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x151b28,
    roughness: 0.85,
    metalness: 0.1,
    fog: false,
  });
  const timberMaterial = new THREE.MeshStandardMaterial({
    color: 0x241c12,
    roughness: 0.9,
    fog: false,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9a24a,
    emissive: 0x9a7024,
    emissiveIntensity: 0.9,
    roughness: 0.5,
    metalness: 0.6,
    fog: false,
  });

  // Hull, tapered toward the bow.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(96, 16, 30), hullMaterial);
  hull.position.y = 8;
  ship.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(15, 30, 4), hullMaterial);
  bow.position.set(54, 9, 0);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  ship.add(bow);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(98, 2, 32), timberMaterial);
  deck.position.y = 17;
  ship.add(deck);

  // Three masts, each taller than the last, with the bowsprit out front. The
  // rig is deliberately tall relative to the hull: the hull sits behind the
  // stage, so the masts are what breaks the skyline above it.
  const masts = [-30, 0, 32];
  for (const [i, x] of masts.entries()) {
    const mastHeight = 92 + i * 14;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.6, mastHeight, 8),
      timberMaterial,
    );
    mast.position.set(x, 20 + mastHeight / 2, 0);
    ship.add(mast);

    const yard = new THREE.Mesh(new THREE.BoxGeometry(34 - i * 6, 1.6, 1.6), timberMaterial);
    yard.position.set(x, 20 + mastHeight * 0.78, 0);
    ship.add(yard);

    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(30 - i * 5, 26 + i * 2),
      new THREE.MeshStandardMaterial({
        color: 0x8e97a8,
        emissive: 0x1a2130,
        roughness: 1,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    sail.position.set(x, 20 + mastHeight * 0.62, 0.4);
    ship.add(sail);
  }

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 44, 8), timberMaterial);
  bowsprit.position.set(74, 24, 0);
  bowsprit.rotation.z = Math.PI / 2.6;
  ship.add(bowsprit);

  // Crow's nest on the mainmast.
  const nest = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 6, 10, 1, true),
    goldMaterial,
  );
  nest.position.set(0, 20 + 106 * 0.94, 0);
  ship.add(nest);

  // A row of lit cannon ports along the hull.
  const portMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3416,
    emissive: 0xd9a441,
    emissiveIntensity: 1.4,
    roughness: 0.6,
    fog: false,
  });
  for (let i = 0; i < 7; i += 1) {
    const port = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), portMaterial);
    port.position.set(-36 + i * 12, 9, 15.4);
    ship.add(port);
  }

  return ship;
}

/* ------------------------------------------------------------------ *
 * LED content
 * ------------------------------------------------------------------ */

/** End-zone board / corner tower content: the headliner's name on a pixel grid. */
function createScreenTexture(text, aspect = 1.6) {
  const canvas = document.createElement('canvas');
  canvas.height = 384;
  canvas.width = Math.round(canvas.height * aspect);
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');

  const backdrop = ctx.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, '#0d1b3a');
  backdrop.addColorStop(1, '#1d2a52');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  // Portrait corner towers stack the name; the wide boards set it on one line.
  const portrait = aspect < 1;
  const size = Math.round(Math.min(width, height) * (portrait ? 0.42 : 0.55));
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eaf2ff';
  ctx.fillText(text, width / 2, portrait ? height * 0.4 : height * 0.46);

  ctx.font = `300 ${Math.round(size * 0.26)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(180,205,255,0.75)';
  ctx.fillText('GLOBE STAGE', width / 2, portrait ? height * 0.62 : height * 0.82);

  pixelGrid(ctx, width, height, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Sideline ribbon content: a long strip of type that scrolls. */
function createRibbonTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#07142e';
  ctx.fillRect(0, 0, 2048, 64);
  ctx.fillStyle = '#9fd4ff';
  ctx.fillRect(0, 0, 2048, 3);
  ctx.fillRect(0, 61, 2048, 3);

  ctx.font = '700 38px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#dceaff';
  const label = `${text}  ·  GLOBE STAGE  ·  `;
  for (let x = 20; x < 2048; x += 470) ctx.fillText(label, x, 34);

  pixelGrid(ctx, 2048, 64, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** Darken a pixel grid so the panels read as LED walls, not printed posters. */
function pixelGrid(ctx, width, height, cell) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < height; y += cell) ctx.fillRect(0, y, width, 1);
  for (let x = 0; x < width; x += cell) ctx.fillRect(x, 0, 1, height);
}
