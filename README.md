# Ye Globe Stage

A WebGL concert stage built on a rotating Earth — the standalone, Vite-powered
version of `ye_globe_stage.html`. Same idea (a black silhouetted performer on
top of the world, hard spotlight, drifting haze) with the pieces broken into
ES modules, no CDN dependency, and a control panel.

## Run it

```bash
cd globe-stage
npm install      # already done once
npm run dev      # http://localhost:5175
npm run build    # static bundle in dist/
npm run preview  # serve the build
```

Everything is local: Three.js comes from npm and the Earth map is served from
`public/textures/`, so the scene works offline. If that texture ever goes
missing, `src/textures.js` paints a procedural ocean/continent fallback onto a
canvas instead of leaving a blank sphere.

## Music

The player opens on the first entry of the setlist in `src/tracks.js` — **KING**
by **YE** — and it is track 01 of the tracklist. The list, numbering, artwork and
durations are all generated from that array, and the set advances to the next
song on its own when a track ends.

### One file per song

Each song is its own module under `src/songs/`, holding that track's audio,
artwork and — the reason it is a file rather than a row — **its own
choreography**:

```js
export const goldDigger = {
  id: 'gold-digger',
  title: 'Gold Digger',
  artist: 'YE',
  src: 'https://…/Gold%20Digger.mp3',
  cover: 'https://…/1000x1000x1.png',

  /** The globe starts fully dark; a cue is what brings it back. */
  opening: { dark: true },

  cues: [
    { at: 14.5, effect: 'strobe', duration: 3.5, relight: true },
    { at: 18, effect: 'fireworks', color: 0xff7a1a, shells: 7 },
  ],
};
```

`tracks.js` imports them and nothing else changes: add a file, import it, append
it to `TRACKS`. `src/cues.js` is the runner — it watches the playhead and hands
back the cues it has just crossed, exactly once each. It is deliberately dumb
about what a cue *does*, so a song can only ever ask for effects the stage
already knows (`flares`, `strobe`, `fireworks`); `main.js` holds the dispatch.
Latching matters as much as firing: seeking backwards past a cue re-arms it,
switching songs re-arms the whole sheet, and starting from a restored position
past a cue fires it instead of silently skipping the moment.

Playback is attempted on load. Where the browser blocks autoplay, the player
says *tap anywhere to start* and the first click or keypress begins playback.

When the analyser can read the track (`access-control-allow-origin: *` on the
asset host), the stage's lighting, beams and bloom pulse with the actual music.
The beat is detected in the percussion band (~4.7-9.4 kHz) rather than the bass:
on a modern master the low end barely moves (measured ~7% swing) while hats and
snares swing 70%+, so that is where the beat actually lives. If nothing is
playing — or the analyser is unavailable — the stage falls back to a synthetic
pulse at `stage.bpm` in `config.js`, so it never looks dead.

## The show clock

The scene opens at **8:58 PM**, twelve minutes before the sunset officially
ends, so the dusk is watchable rather than skipped. `CONFIG.timeline` holds
the three beats and `src/sunset.js` interpolates between them:

| Clock | Show time | What the sky does |
| --- | --- | --- |
| 8:58 PM | 0s | Sun is low and warm; the sky is still bright enough that stars are nearly absent |
| 9:00 PM | 120s | Concert starts — the sun is *barely* a sliver above the stands |
| 9:10 PM | 720s | Sunset officially ends; the show plays the rest under full night |

The clock is a wall clock: it keeps running even while the animation is paused,
because 9:00 PM is 9:00 PM. Before the 9:00 downbeat the stage lighting is held
back to `preShowGain` (0.34) and released at the concert start. The sun is a
sprite that dims and sinks behind the far stand, and the sky is a shader that
carries warmth (amber horizon glow) and night as separate uniforms, so daylight
and starlight can be crossfaded independently.

## The cue sheets

**KING — 00:18.5: the red flares.** Sixteen **red stadium flares** are fired from
one clean ring around the globe. They are deliberately not fireworks: each is a
single controlled spark, and the stations sit in the same plane as a dim red
guide ring which flashes as the ignition line and then fades, so the volley
reads as staged around the planet rather than as an explosion.

They are *launched*, not switched on. Every flare leaves its station on a
ballistic arc, up and outward along its own spoke of the ring at
`launch.elevationDeg` (75°, so a visible 15° lean off vertical), trailing a
streak that is long while it is fast off the line and collapses to a dot as it
hangs at the apex. The arc is tuned to the burn — flight time is
`2 * sin(elevation) * speed / gravity`, which with the shipped numbers is 5.5s —
so a flare is coming back down to the ring about as it gutters out, and a
replayed cue fires from the ring again rather than from wherever the last volley
burned out. Measured on the first flare: it rises from y=23 to y≈207, drifting
94 units outward, and is mid-descent at burnout.

The cue is latched off `player.audio.currentTime`, so it fires exactly once when
playback *crosses* 18.5s. Seeking backwards past it re-arms the cue; starting
playback from a restored position beyond it fires immediately rather than
silently skipping the moment. Scrubbing and replay logic lives in the render
loop, while `flares.js` is a pure `trigger()`/`update(dt, beat)` state machine.

Crossing the cue also makes the **Earth turn 1.55x faster**, which holds for the
rest of the track — the globe is still visibly faster at 9:10 than it was at
8:58.

**Gold Digger — 00:14.5: strobe, 00:18: fireworks.** The song opens in
blackout: `opening: { dark: true }` kills the planet's own illumination on load
and it stays dead until the strobe cue. At **00:14.5** an intense full-frame
strobe hits (13 Hz square wave, `CONFIG.strobe`) and `relight: true` lifts the
blackout with it — the strobe is what reveals the planet, not a slow fade. The
strobe stops at **00:18.0**, and that same instant the cue fires a volley of
**orange firework shells** (`0xff7a1a`), which climb from behind the bowl's rim
and break in the sky over the far end.

## The stadium

The backdrop is Raymond James Stadium, and it is built to the real building's
plan rather than approximated as a ring of seating:

- **A racetrack bowl, not a circle.** The plan is two long straights with the
  end zones rounded into semicircles, which is what earns the real stadium its
  two **680 ft LED ribbons** along the east and west fascias. The plan is
  arc-length parameterised and the seating *section* is lofted around it, so the
  straight sides and the curves get the same even treatment.
- **Multitier section.** Lower bowl, a vertical club facade, a set-back club
  level, an upper-deck fascia and a steep upper deck, capped with a lit trim lip
  that draws the rim of the bowl against the sky. The tiers are per-vertex
  tones on a single mesh, so the whole sweep of seating is one draw call.
- **Two 60 x 160 ft end-zone boards** above the north and south ends — the
  largest in the league, and the reason the far end reads as a stadium from the
  stage. **Four 61 x 43 ft corner video towers**, one per corner, portrait.
- **Buccaneers Cove.** A wedge of the north end-zone arc is cut out of the
  seating and the **pirate ship** sits in it, which is what breaks the
  otherwise continuous bowl. The ship is a low-poly silhouette — hull, three
  masts with yards and sails, crow's nest and lit cannon ports — turned broad
  on so the rig reads as a ship rather than one line of masts.
- **A crowd.** Phone flashes and seat-back LEDs on the seating, sampled from
  the *same* section the bowl is lofted from, so they sit on the seats rather
  than floating. Sample counts are in `QUALITY.stadiumAudience`.

`CONFIG.stadium` holds the plan (half width, straight run, cove angle); roughly
1 unit is 1 ft, which is what makes a 680 ft straight and a 60 ft board land at
their true size. One honest caveat about the framing: the camera sits inside the
bowl looking down the long axis, so the far end zone is mostly behind the stage
and only its upper works show — the ribbing above the video board. Orbit round
the side and the cove, the ship and the corner towers all come into view.

## Controls

| Input | Action |
| --- | --- |
| drag | orbit the camera around the stage |
| scroll | zoom (clamped so you can't fly under the floor) |
| space | play/pause the music |
| `p` | pause/resume the animation |
| `m` | mute/unmute |
| `r` | reset the camera to its opening frame |
| `h` | hide/show all UI chrome |

The panel in the top right toggles each layer (camera orbit, globe spin, cursor
parallax, beams, the projector, the red flare cue, audience lights, the mosh
pit, stadium, haze, starfield, bloom) and exposes spin and glow-strength
sliders. The FPS readout doubles as a cheap perf check.

The effect switches are normal layer toggles, so an automatic cue can be muted
without touching the song: leave the flare cue on and KING's 18.5s cue fires,
turn it off to play the show without it.

## Structure

```
src/
  main.js       renderer, composer, animation loop, wiring
  config.js     every tunable number + device quality tiers
  globe.js      Earth sphere, atmospheric glow shell, artist figure
  lights.js     concert lighting rig
  smoke.js      rising stage haze
  stadium.js    Raymond James Stadium: racetrack plan, lofted tiers,
                end-zone boards, corner towers, ribbons, cove + pirate ship,
                audience lights
  projector.js  the bleacher projector: gobo, light and volumetric cone
  lightCone.js  shared volumetric cone material used by beams + projector
  flares.js     KING's launched red flares: ballistic arcs + streaks (shader)
  fireworks.js  Gold Digger's orange shells: fuses, bursts, gravity, drag
  strobe.js     the concert strobe post pass
  cues.js       the per-song cue runner (latch, seek, re-arm)
  crowd.js      shared audience-light shader
  mosh.js       the mosh pit: phone lights on the field
  songs/        one file per song: audio, artwork, cue sheet
    king.js
    goldDigger.js
  sunset.js     the 8:58-9:10 PM timeline: sky shader, sun, night falloff
  beams.js      stage beams and sweeping lasers (custom shader)
  starfield.js  distant stars (opts out of scene fog)
  controls.js   OrbitControls + cursor-parallax rig
  textures.js   texture loading + procedural Earth fallback
  player.js     audio element, analyser, transport, tracklist
  beat.js       beat envelope: real audio with a BPM fallback
  tracks.js     the setlist
  ui.js         control panel, shortcuts, loader, FPS
  style.css     overlay styling
```

## What changed from the single-file original

- **Module split** with a central `config.js`, so restaging the look is a
  one-file edit. Particle budgets and pixel ratio scale down on small screens,
  and `prefers-reduced-motion` turns off the idle spin and parallax.
- **Offline-first assets** — Three.js is bundled, not a CDN script tag, and the
  Earth texture ships with the site.
- **Camera you can drive**: OrbitControls with damping and auto-rotate, plus a
  mouse parallax that tilts the stage rig instead of the camera (moving the
  camera directly fights OrbitControls' spherical math). The camera orbits a
  point above the performer, so the globe sits low in the frame with only its
  upper half visible — the floor plane *is* the horizon, cutting the sphere at
  its equator.
- **More stage**: deep-blue atmospheric rim glow on the globe, a starfield that
  ignores the fog, audience phone-lights twinkling around the floor, wide beams
  and sweeping lasers that pulse with the beat, and UnrealBloom on top.
- **Light used correctly for modern Three.js**: the original's `intensity: 8`
  spotlight assumed legacy lighting units. The rig now sets `decay = 0` so
  intensities behave predictably, and the shadow map type was updated
  (`PCFSoftShadowMap` was removed from Three.js).
- **Robustness**: a real loading bar driven by texture progress with a timeout
  safety net, a WebGL-unavailable message, resize handling, a 60 fps cap (rAF
  can spin at 900+ fps in embedded webviews, which pegs the machine), and paused
  rendering while the tab is hidden.

`window.__stage` exposes the renderer, scene, camera, composer and state object
for console poking and automated checks.
