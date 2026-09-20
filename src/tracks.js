import { king } from './songs/king.js';
import { goldDigger } from './songs/goldDigger.js';
import { stronger } from './songs/stronger.js';

/**
 * The setlist. Order is playback order — the first entry is what the stage
 * opens on.
 *
 * One file per song, under `songs/`: each holds that track's audio, artwork and
 * its own cue sheet. Adding a song means adding a file and importing it here;
 * the player renders whatever it finds, including the numbering, artwork and
 * durations, and the cue runner reads whatever choreography the song declares.
 */
export const TRACKS = [king, goldDigger, stronger];
