/**
 * All DOM wiring: the control panel is generated from the specs below, so
 * adding a feature means adding one row here plus its toggle in main.js.
 */

const TOGGLES = [
  { key: 'autoRotate', label: 'Orbit camera' },
  { key: 'spin', label: 'Globe spin' },
  { key: 'parallax', label: 'Cursor parallax' },
  { key: 'beams', label: 'Light beams' },
  { key: 'projector', label: 'Projector' },
  { key: 'flares', label: 'Red flare cue' },
  { key: 'crowd', label: 'Audience lights' },
  { key: 'mosh', label: 'Mosh pit' },
  { key: 'stadium', label: 'Stadium' },
  { key: 'smoke', label: 'Stage haze' },
  { key: 'stars', label: 'Starfield' },
  { key: 'bloom', label: 'Bloom glow' },
  { key: 'paused', label: 'Pause animation' },
];

const SLIDERS = [
  { key: 'spinSpeed', label: 'Spin speed', min: 0, max: 0.4, step: 0.005, decimals: 2 },
  { key: 'bloomStrength', label: 'Glow strength', min: 0, max: 1.4, step: 0.02, decimals: 2 },
];

/**
 * @param {object} options
 * @param {Record<string, any>} options.state mutable shared state object
 * @param {(key: string, value: any) => void} options.onChange
 * @param {() => void} options.onReset
 * @param {() => void} options.onToggleAudio
 * @param {() => void} options.onToggleMute
 */
export function createUI({ state, onChange, onReset, onToggleAudio, onToggleMute }) {
  const panelBody = document.getElementById('panel-body');
  const panelFoot = document.getElementById('panel-foot');
  const fpsEl = document.getElementById('fps');
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderNote = document.getElementById('loader-note');

  const inputs = new Map();

  for (const spec of TOGGLES) {
    const row = document.createElement('label');
    row.className = 'row';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(state[spec.key]);
    input.addEventListener('change', () => {
      state[spec.key] = input.checked;
      onChange(spec.key, input.checked);
    });

    const label = document.createElement('span');
    label.className = 'row__label';
    label.textContent = spec.label;

    row.append(input, label);
    panelBody.append(row);
    inputs.set(spec.key, input);
  }

  for (const spec of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'row row--slider';

    const head = document.createElement('div');
    head.className = 'row__sliders';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const value = document.createElement('span');
    value.textContent = Number(state[spec.key]).toFixed(spec.decimals);
    head.append(name, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(state[spec.key]);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      state[spec.key] = next;
      value.textContent = next.toFixed(spec.decimals);
      onChange(spec.key, next);
    });

    row.append(head, input);
    panelBody.append(row);
    inputs.set(spec.key, input);
  }

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'panel__button';
  resetButton.textContent = 'Reset view (r)';
  resetButton.addEventListener('click', onReset);
  panelBody.append(resetButton);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'h') {
      document.body.classList.toggle('ui-hidden');
    } else if (key === 'r') {
      onReset();
    } else if (key === 'm') {
      onToggleMute?.();
    } else if (event.code === 'Space') {
      // Space drives the music; the scene's own pause lives on `p`.
      event.preventDefault();
      onToggleAudio?.();
    } else if (key === 'p') {
      state.paused = !state.paused;
      syncToggle('paused', state.paused);
      onChange('paused', state.paused);
    }
  });

  function syncToggle(key, value) {
    const input = inputs.get(key);
    if (input && input.type === 'checkbox') input.checked = Boolean(value);
  }

  return {
    setFps(fps) {
      fpsEl.textContent = `${Math.round(fps)} fps`;
    },

    setStatus(text) {
      panelFoot.textContent = text;
    },

    setProgress(ratio) {
      loaderBar.style.width = `${Math.round(ratio * 100)}%`;
    },

    setNote(text) {
      loaderNote.textContent = text;
    },

    dismissLoader() {
      loader.classList.add('is-done');
      setTimeout(() => loader.remove(), 1100);
    },

    showFatal(message) {
      const el = document.getElementById('fatal');
      el.hidden = false;
      el.innerHTML = `<strong>WebGL unavailable</strong><span>${message}</span>`;
      loader.remove();
    },
  };
}
