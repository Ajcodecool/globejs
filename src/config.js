/**
 * Every tunable number in the simulation lives here, so the look can be
 * re-staged without hunting through the scene code.
 */
export const CONFIG = {
  globe: {
    radius: 60,
    segments: 64,
    /** Sink the sphere so it rises out of the haze rather than floating. */
    yOffset: -15,
    /** Axial tilt in degrees — the classic 23.5°. */
    tilt: 23.5,
    /** Radians per second of idle spin. */
    spinSpeed: 0.09,
  },

  camera: {
    fov: 45,
    near: 0.1,
    far: 2000,
    start: { x: 0, y: 30, z: 150 },
    /**
     * The camera orbits a point this far above the performer, which drops the
     * globe lower in the frame and leaves the upper half for sky and beams.
     * Too much and the sphere sinks behind the viewport edge and the player.
     */
    targetLift: 12,
  },

  /** Exponential fog swallows the base of the globe in darkness. */
  fogDensity: 0.0055,

  artist: {
    height: 2.5,
  },

  stage: {
    /**
     * The floor plane is the horizon of the scene: it sits at the sphere's
     * equator, so exactly the upper half of the globe is ever visible.
     */
    floorOffset: 0,
    /** Tempo of the fallback pulse used before the track's own energy is read. */
    bpm: 120,
    beamCount: 6,
  },

  parallax: {
    /** Max radians the whole rig tilts toward the cursor. */
    strength: 0.05,
    ease: 0.045,
  },

  bloom: {
    /** Restrained on purpose: only the brightest highlights should glow. */
    strength: 0.42,
    radius: 0.62,
    threshold: 0.85,
  },

  render: {
    /**
     * Hard ceiling on presented frames. requestAnimationFrame can fire far
     * faster than the display refresh (some embedded webviews run it at 900+
     * fps with no vsync), which pegs the main thread and the GPU and starves
     * the compositor — the page then appears frozen on a black surface.
     */
    maxFps: 60,
  },

  /**
   * Raymond James Stadium. The plan is a racetrack — straight sidelines with
   * semicircular end zones — which is what the 680 ft ribbons and the 60x160 ft
   * end-zone boards hang off, and the north end has Buccaneers Cove cut out of
   * it for the pirate ship. Roughly 1 unit = 0.8 ft.
   */
  stadium: {
    /** Plan samples around the bowl, used by both the loft and the audience. */
    segments: 220,
    /** Corner floodlight masts. */
    towerCount: 4,
    /** Corner HD video walls, 61 ft tall by 43 ft wide. */
    videoTowers: 4,
    screenText: 'YE',
    /**
     * Front rows sit this far off the centreline at the sidelines, and the
     * straight runs this far either side of the middle. With 1 unit ~= 1 ft
     * that makes the two sidelines 680 ft long, which is the length of the real
     * LED ribbons, and the 60 x 160 ft end-zone boards land at their true size.
     */
    halfWidth: 132,
    straightHalfLength: 340,
    /**
     * Degrees of the north end-zone arc given to the pirate ship. Kept narrow:
     * the cove is cut out of the dead centre of the far end, which is exactly
     * the strip of seating that reads above the stage.
     */
    coveHalfAngle: 30,
  },

  /**
   * The projector rig up in the upper deck, throwing an image onto the planet
   * from the bleachers.
   */
  /**
   * The show's local timeline. It opens at 8:58 PM, the concert starts at
   * 9:00 PM (120s in) and the sunset officially ends at 9:10 PM (720s in).
   */
  timeline: {
    startHour: 20,
    startMinute: 58,
    concertStartSeconds: 120,
    sunsetEndSeconds: 720,
    /** Stage level during the pre-show, before the 9:00 PM downbeat. */
    preShowGain: 0.34,
  },

  /**
   * The red flare ring. Its *cue time* lives in the song file, not here — this
   * is only how the effect looks once a song fires it.
   */
  flares: {
    duration: 5.5,
    count: 16,
    radiusOffset: 13,
    /**
     * The launch. Each flare is *fired* from its station on the ring, up and
     * outward at an angle, rather than switched on in place. The arc is tuned
     * to the burn: flight time is 2 * sin(elevation) * speed / gravity, which
     * with these numbers is 5.5s — so a flare comes back down to the ring at
     * about the moment it gutters out.
     */
    launch: {
      /** Degrees above horizontal. 75 is a visible lean of 15° off vertical. */
      elevationDeg: 75,
      /** Per-flare jitter on the elevation, in degrees, so the volley is not rigid. */
      spreadDeg: 8,
      /** Muzzle speed, in units per second, with a little per-flare variation. */
      speed: 125,
      /** Downward acceleration, units per second squared. */
      gravity: 44,
      /** Streak length per unit of current speed, and its clamps. */
      trailPerSpeed: 0.17,
      minTrail: 4,
      maxTrail: 32,
      /** Seconds for the ignition ring to fade once the flares are away. */
      ringFade: 1.8,
    },
  },

  /** Concert strobe: a hard full-frame flash, fired by a song cue. */
  strobe: {
    color: 0xffffff,
    /** Flashes per second. */
    hz: 13,
    /** Fraction of each cycle that is lit — a hard square wave, not a ramp. */
    duty: 0.42,
    level: 0.96,
  },

  /** Orange firework shells, fired by a song cue. */
  fireworks: {
    color: 0xff7a1a,
    /** Pool size; a burst never allocates. */
    maxSparks: 4200,
    sparksPerShell: 170,
    /** Default shells per cue when the cue does not say. */
    shells: 7,
    /** Shells rise from behind the bowl's rim and break in the sky beyond. */
    launchY: 170,
    nearZ: 340,
    spreadZ: 300,
    /** Half-width of the break zone as a fraction of the distance out. */
    spreadX: 0.4,
    burstY: [220, 335],
    /** Downward acceleration on the sparks. */
    gravity: 54,
    /** Exponential velocity damping, per second. */
    drag: 0.85,
    sparkLife: [1.15, 2.0],
    /** Share of sparks that burn white-hot at the centre of the break. */
    coreShare: 0.16,
  },

  /**
   * Stronger's production effects. Only that song's cue sheet fires these.
   */
  showfx: {
    xBeam: {
      color: 0xa9c8ff,
      opacity: 0.46,
      /** Beam length at full extension — tall enough to cross well past the apex. */
      height: 330,
      topRadius: 6,
      baseRadius: 22,
      /**
       * The X. Two pairs flank the dome, this far either side of centre, and
       * each pair's legs stand `pairSpread` apart at ground level leaning
       * inward, so both crossings hang in open sky beside the planet and the
       * whole formation reads across the venue.
       */
      pairOffsetX: 92,
      pairSpread: 55,
      leanAngle: 0.46,
      /** Seconds to climb out of the ground, and to fade at the 0:47 slam. */
      growSeconds: 14,
      fadeSeconds: 1.6,
      /** Placed behind the dome, this far beyond the globe's centre. */
      distance: 150,
    },
    redFlash: {
      color: 0xff1a08,
      /** Peak alpha of the wash. */
      level: 0.62,
      /** Seconds to decay from the peak. */
      decay: 1.4,
    },
    redPyro: {
      color: 0xff2410,
      maxSparks: 3600,
      sparksPerBurst: 130,
      speed: 92,
      gravity: 42,
      drag: 0.9,
      life: [0.9, 1.7],
    },
    fountain: {
      color: 0xffc25e,
      /** [x, z] of each jet, behind the dome relative to the default camera. */
      jets: [[-80, -150], [-27, -185], [27, -185], [80, -150]],
      speed: 130,
      gravity: 55,
      drag: 0.55,
      life: [1.4, 2.4],
      /** Emissions per jet, and how often. */
      sparksPerEmit: 26,
      emitInterval: 0.06,
      /** How long the fountains run before being cut off. */
      seconds: 5,
    },
  },

  projector: {
    position: { x: 120, y: 150, z: 300 },
    target: { x: -15, y: 0, z: 20 },
    /** Full cone angle in degrees; ~13° lands a pool about the size of Earth. */
    fov: 13,
    /** Radius of the beam where it reaches the globe. */
    poolRadius: 42,
    lightIntensity: 3.6,
    projectionIntensity: 0.95,
  },

  smoke: {
    minRadius: 55,
    maxRadius: 95,
    riseSpeed: 1.6,
    driftSpeed: 0.007,
    /** Height of the haze bed measured up from the floor plane. */
    bedTop: 30,
  },
};

const smallScreen =
  typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 720;

/** Respect the OS "reduce motion" preference: less churn, no idle spin. */
export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Particle budgets and resolution scale, sized for the current device. */
export const QUALITY = smallScreen
  ? {
      smoke: 320,
      stars: 600,
      pixelRatio: 1.5,
      shadowMap: 1024,
      stadiumAudience: 7000,
      mosh: 4200,
      projectorDust: 120,
    }
  : {
      smoke: 900,
      stars: 1500,
      pixelRatio: 2,
      shadowMap: 1024,
      stadiumAudience: 22000,
      mosh: 11000,
      projectorDust: 260,
    };
