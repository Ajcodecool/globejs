import { CONFIG } from './config.js';

/**
 * The beat that drives the light rig and beams.
 *
 * While music is playing and audio analysis is available, this follows the
 * low-frequency energy of the actual track: it jumps up on a kick and falls
 * away smoothly. When nothing is playing — or the analyser is unavailable —
 * it falls back to a synthetic pulse at the configured BPM so the stage never
 * looks dead.
 */
export function createBeat() {
  let level = 0;
  let syntheticBias = 0;

  return {
    /** @param {number} dt seconds @param {number} time @param {number} energy 0..1 from the player */
    update(dt, time, energy) {
      if (energy > 0) {
        // The player already shapes a hit-and-decay envelope; this just eases
        // it into the value the lights consume.
        const rate = energy > level ? 26 : 9;
        level += (energy - level) * Math.min(1, rate * dt);
        syntheticBias = 0;
        return level;
      }

      // Nothing playing (or between hits): fall back to a BPM pulse, eased in
      // so the stage keeps a heartbeat without a visible jump.
      syntheticBias = Math.min(1, syntheticBias + dt * 0.8);
      const synthetic = beatPulse(time, CONFIG.stage.bpm) * 0.8 * syntheticBias;
      level += (synthetic - level) * Math.min(1, 8 * dt);
      return level;
    },

    get value() {
      return level;
    },
  };
}

/**
 * Envelope that spikes on every beat and decays fast — a cheap stand-in for
 * audio reactivity, derived purely from time and the configured BPM.
 * @returns {number} 0..1
 */
export function beatPulse(time, bpm) {
  const beatsPerSecond = bpm / 60;
  const phase = (time * beatsPerSecond) % 1;
  return Math.pow(1 - phase, 3.2);
}
