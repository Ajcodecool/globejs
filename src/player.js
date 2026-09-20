/**
 * The music player: artwork, transport, seek/volume, a tracklist, and an
 * analyser tapped off the audio graph so the stage can react to the actual
 * song.
 *
 * Autoplay is attempted on load. Browsers that refuse it (no user gesture yet)
 * leave the transport in a "tap to play" state and the first click or keypress
 * anywhere starts playback.
 *
 * @param {object} options
 * @param {Array<{id: string, title: string, artist: string, src: string, cover: string}>} options.tracks
 * @param {number} [options.volume]
 * @param {(track: object, index: number) => void} [options.onTrackChange]
 *   Fired from `load`, so the caller can re-arm that song's cues.
 */
export function createPlayer({ tracks, volume = 0.8, onTrackChange }) {
  const els = {
    root: document.getElementById('player'),
    cover: document.getElementById('player-cover'),
    title: document.getElementById('player-title'),
    artist: document.getElementById('player-artist'),
    play: document.getElementById('player-play'),
    prev: document.getElementById('player-prev'),
    next: document.getElementById('player-next'),
    mute: document.getElementById('player-mute'),
    volume: document.getElementById('player-volume'),
    seek: document.getElementById('player-seek'),
    elapsed: document.getElementById('player-elapsed'),
    duration: document.getElementById('player-duration'),
    list: document.getElementById('player-tracklist'),
  };

  const audio = new Audio();
  // The asset host sends `access-control-allow-origin: *`; without this the
  // analyser would only ever read silence.
  audio.crossOrigin = 'anonymous';
  audio.preload = 'metadata';
  audio.volume = volume;

  let index = 0;
  let ctx = null;
  let analyser = null;
  let bins = null;

  /** Flipped off if the analyser cannot be built or is stuck reading silence. */
  let analysisAvailable = true;
  let silentFrames = 0;
  let waitingForGesture = false;

  /* Beat detection state. */
  let percussionAvg = 0;
  let hit = 0;
  let lastHitAt = 0;
  let lastSampleAt = 0;
  let hits = 0;

  els.volume.value = String(volume);

  /* ---------------- audio graph ---------------- */
  function ensureGraph() {
    if (ctx || !analysisAvailable) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtor();
      const source = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      bins = new Uint8Array(analyser.frequencyBinCount);
    } catch (error) {
      console.warn('[player] analyser unavailable, stage falls back to its own pulse', error);
      analysisAvailable = false;
      ctx = null;
      analyser = null;
    }
  }

  /* ---------------- transport ---------------- */
  async function play() {
    ensureGraph();
    if (ctx?.state === 'suspended') {
      // Deliberately not awaited: before any user gesture this promise can stay
      // pending indefinitely, which would block playback entirely. The audio
      // element plays regardless and the stage falls back to its own pulse
      // until the context unlocks.
      ctx.resume().catch(() => {});
    }

    try {
      await audio.play();
      waitingForGesture = false;
      setPlaying(true);
    } catch {
      // Autoplay blocked — wait for any interaction, then try again.
      waitingForGesture = true;
      setPlaying(false, true);
      armGestureStart();
    }
  }

  function pause() {
    audio.pause();
    setPlaying(false);
  }

  function toggle() {
    if (audio.paused) play();
    else pause();
  }

  function armGestureStart() {
    const start = (event) => {
      // The player's own buttons and sliders handle their own clicks; treating
      // them as a global "start" gesture would toggle playback twice.
      if (event?.target instanceof Element && event.target.closest('#player')) return;

      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      if (waitingForGesture) play();
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  function load(i, autoplay = false) {
    index = ((i % tracks.length) + tracks.length) % tracks.length;
    const track = tracks[index];

    audio.src = track.src;
    els.title.textContent = track.title;
    els.artist.textContent = track.artist;
    els.cover.src = track.cover;
    els.cover.alt = `${track.title} artwork`;

    els.seek.value = '0';
    els.elapsed.textContent = '0:00';
    els.duration.textContent = '0:00';
    els.prev.disabled = tracks.length < 2;
    els.next.disabled = tracks.length < 2;

    renderList();
    // Every song brings its own choreography, so the caller re-arms here.
    onTrackChange?.(track, index);
    if (autoplay) play();
  }

  function step(direction) {
    if (tracks.length < 2) return;
    load(index + direction, !audio.paused);
  }

  /* ---------------- UI state ---------------- */
  function setPlaying(isPlaying, needsGesture = false) {
    els.root.dataset.playing = String(isPlaying);
    els.root.dataset.needsGesture = String(needsGesture);
    els.play.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  function renderList() {
    els.list.replaceChildren(
      ...tracks.map((track, i) => {
        const item = document.createElement('li');
        item.className = 'track';
        item.dataset.index = String(i);
        if (i === index) item.setAttribute('aria-current', 'true');

        const num = document.createElement('span');
        num.className = 'track__num';
        num.textContent = String(i + 1).padStart(2, '0');

        const name = document.createElement('span');
        name.className = 'track__name';
        name.textContent = track.title;

        const artist = document.createElement('span');
        artist.className = 'track__artist';
        artist.textContent = track.artist;

        item.append(num, name, artist);
        item.addEventListener('click', () => load(i, true));
        return item;
      }),
    );
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  /* ---------------- events ---------------- */
  els.play.addEventListener('click', toggle);
  els.prev.addEventListener('click', () => step(-1));
  els.next.addEventListener('click', () => step(1));

  els.mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    els.root.dataset.muted = String(audio.muted);
    els.mute.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
  });

  els.volume.addEventListener('input', () => {
    audio.volume = Number(els.volume.value);
    if (audio.volume > 0 && audio.muted) {
      audio.muted = false;
      els.root.dataset.muted = 'false';
    }
  });

  els.seek.addEventListener('input', () => {
    if (!Number.isFinite(audio.duration) || audio.duration === 0) return;
    audio.currentTime = (Number(els.seek.value) / 1000) * audio.duration;
  });

  audio.addEventListener('loadedmetadata', () => {
    els.duration.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    els.elapsed.textContent = formatTime(audio.currentTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      els.seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    }
  });

  audio.addEventListener('ended', () => {
    if (tracks.length > 1) {
      load(index + 1, true);
    } else {
      // Single track: stop cleanly and rewind rather than looping forever.
      audio.currentTime = 0;
      setPlaying(false);
    }
  });

  // Carry the "waiting for a gesture" flag through, otherwise an unrelated
  // pause event would hide the prompt while playback is still blocked.
  audio.addEventListener('pause', () => setPlaying(false, waitingForGesture));
  audio.addEventListener('play', () => setPlaying(true));

  load(0, true);

  return {
    audio,
    /** Exposed for debugging/automated checks. */
    get analyser() {
      return analyser;
    },
    get bins() {
      return bins;
    },
    play,
    pause,
    toggle,
    step,
    select: (i) => load(i, true),

    get isPlaying() {
      return !audio.paused;
    },

    /**
     * Beat envelope for the current frame, 0..1, decaying from each detected
     * hit. Returns 0 when nothing is playing so the caller falls back to its
     * synthetic pulse.
     *
     * Detection happens in the percussion band rather than the bass: on a
     * modern master the low end is a near-constant wall (measured ~7% swing),
     * while hats and snares swing 70%+ — so that is where the beat actually is.
     */
    sampleEnergy() {
      const now = performance.now();
      const dt = lastSampleAt ? Math.min(0.1, (now - lastSampleAt) / 1000) : 1 / 60;
      lastSampleAt = now;

      // Always decay whatever we last reported, so a paused track fades out
      // instead of freezing lit.
      hit *= Math.exp(-dt * 7);
      if (hit < 0.001) hit = 0;

      if (!analyser || audio.paused || audio.readyState < 2) return 0;

      analyser.getByteFrequencyData(bins);

      // ~4.7-9.4 kHz: hats, snares, consonants.
      let percussion = 0;
      for (let i = 100; i < 200; i += 1) percussion += bins[i];
      percussion /= 100;

      if (percussion === 0 && bins[0] === 0) {
        // Silence while playing means the analyser is being fed nothing
        // (blocked audio graph); stop paying for it.
        silentFrames += 1;
        if (silentFrames > 180) analysisAvailable = false;
        return 0;
      }
      silentFrames = 0;

      // Slow follower as the moving baseline; a hit is a jump above it.
      percussionAvg += (percussion - percussionAvg) * 0.045;
      const onset = percussion - percussionAvg;
      // Biased toward the strong transients: catching every hi-hat would put
      // the stage at a constant strobe rather than a beat.
      const threshold = Math.max(7, percussionAvg * 0.22);

      // 200 ms refractory keeps double-triggers off a single transient.
      if (onset > threshold && now - lastHitAt > 200) {
        lastHitAt = now;
        hits += 1;
        hit = 1;
      }

      return hit;
    },

    /** Hits detected since load — handy for verifying detection in tests. */
    get hitCount() {
      return hits;
    },
  };
}
