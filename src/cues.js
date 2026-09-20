/**
 * The cue runner.
 *
 * A song declares cues in track time; this watches the playhead and hands back
 * the ones it has just crossed, exactly once each. It is deliberately dumb
 * about what a cue *does* — the caller has the effects.
 *
 * Latching matters as much as firing: seeking backwards past a cue re-arms it,
 * and starting playback from a restored position past a cue fires it
 * immediately rather than silently skipping the moment.
 */
export function createCueRunner(cues = []) {
  const fired = cues.map(() => false);
  let lastTime = 0;

  /** Rewind to the top: everything armed again. */
  function arm() {
    fired.fill(false);
    lastTime = 0;
  }

  return {
    /** @returns {Array<object>} the cues crossed since the previous frame. */
    update(trackTime) {
      // A backwards jump of more than a second is a seek, not playback.
      if (trackTime < lastTime - 1) arm();

      const crossed = [];
      cues.forEach((cue, i) => {
        if (!fired[i] && trackTime >= cue.at) {
          fired[i] = true;
          crossed.push(cue);
        }
      });
      lastTime = trackTime;
      return crossed;
    },

    arm,
    get cues() {
      return cues;
    },
    /** True if this cue has already gone off — used by the checks. */
    hasFired(index) {
      return Boolean(fired[index]);
    },
  };
}
