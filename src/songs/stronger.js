/**
 * Stronger — Kanye West.
 *
 * The production arc, in track time:
 *
 *   0:00  grey globe — texture visible but drained of colour, house lights low
 *   0:30  the lights fade in and the colour comes back to the planet
 *   0:30  blue-white overhead spot pins the artist; large beams behind the
 *         dome shoot up through the sky, crossing into sharp X formations
 *   0:47  the beams have reached the globe and cut out, the stadium flashes
 *         red, and red pyro bursts fire from around the base ring
 *   0:49  vertical golden spark fountains fire behind the globe, building a
 *         wall of smoke and light
 *   after the pyro  the Earth settles into a faster 0.9 rad/s spin
 */
export const stronger = {
  id: 'stronger',
  title: 'Stronger',
  artist: 'Kanye West',
  src: 'https://api.croomsconnect.com/storage/v1/object/public/assets/Kanye%20West%20-%20Stronger%20(Chicago).mp3',
  cover: 'https://thumb.wikimedia.org/wikipedia/en/thumb/7/70/Graduation_%28album%29.jpg/250px-Graduation_%28album%29.jpg',

  /** Grey globe, not a black one: the map is visible, drained of colour. */
  opening: { grey: true, dim: 0.45 },

  cues: [
    // 0:30 — the lights fade in over four seconds.
    { at: 30, effect: 'lightsUp', fade: 4 },

    // The spot + X-beam phase runs from the lights-up until 0:47, when the
    // beams have reached the globe and the production slams to red.
    { at: 30, effect: 'xBeams' },
    { at: 47, effect: 'xBeamsEnd' },
    { at: 47, effect: 'redFlash' },
    { at: 47, effect: 'redPyro' },
    { at: 49, effect: 'goldenFountains' },
    { at: 53, effect: 'spin', speed: 2 },
  ],
};
