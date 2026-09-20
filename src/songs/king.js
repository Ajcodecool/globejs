/**
 * KING — the set opener.
 *
 * One file per song: the track data the player needs, plus this song's own
 * choreography. `cues` are the moments the stage changes, in track time, and
 * they are what the cue runner in `cues.js` dispatches.
 */
export const king = {
  id: 'king',
  title: 'KING',
  artist: 'YE',
  /** Cross-origin readable, so the analyser can drive the stage lights. */
  src: 'https://api.croomsconnect.com/storage/v1/object/public/assets/YE%20-%20KING.mp3',
  cover: 'https://images.genius.com/5c6c5c8b0189f1d99cd9ccf906da031e.1000x1000x1.png',

  cues: [
    /**
     * 00:18.5 — the red flare ring ignites around the globe, and the Earth
     * picks up a faster turn that it keeps for the rest of the set.
     */
    { at: 18.5, effect: 'flares', spin: 1.55 },
  ],
};
