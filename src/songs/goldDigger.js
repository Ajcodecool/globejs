/**
 * Gold Digger.
 *
 * Opens in blackout: the planet is dead until 00:14.5, when the strobe hits and
 * the stage slams back to life. The strobe runs until 00:18, and the moment it
 * stops the orange fireworks go up over the stadium.
 */
export const goldDigger = {
  id: 'gold-digger',
  title: 'Gold Digger',
  artist: 'YE',
  src: 'https://api.croomsconnect.com/storage/v1/object/public/assets/Gold%20Digger.mp3',
  cover: 'https://images.genius.com/f950b7a07bb95fdd4d1499681c570348.1000x1000x1.png',

  /** The globe starts fully dark, and the strobe is what brings it back. */
  opening: { dark: true },

  cues: [
    // 00:14.5 — intense strobe, and the blackout ends with it.
    { at: 14.5, effect: 'strobe', duration: 2.5, relight: true },
    // 00:18 — the strobe stops and the orange shells go up.
    { at: 18, effect: 'fireworks', color: 0xff7a1a, shells: 7 },
  ],
};
