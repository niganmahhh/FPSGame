// Audio kit: upgraded procedural firearm/melee SFX plus optional external
// audio overrides loaded from /sounds/sounds.json.
//
// External audio files (mp3/wav/ogg) are OPTIONAL. Drop them into
// public/sounds/ and reference them in public/sounds/sounds.json keyed by
// weapon id. When a sample is missing or the manifest fails to load, the
// kit silently falls back to the procedural synthesised sounds below.
//
// Only use audio sources you have the legal right to distribute (CC0,
// CC-BY, original, properly licensed). Do not bundle copyrighted commercial
// game audio.

const MANIFEST_URL = `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}sounds/sounds.json`;

function ensureContext(contextRef) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    if (!contextRef.value) {
      contextRef.value = new AudioContextClass();
    }
    if (contextRef.value.state === 'suspended') {
      contextRef.value.resume();
    }
    return contextRef.value;
  } catch {
    return null;
  }
}

// One-shot oscillator tone with exponential pitch + gain decay.
function tone(ctx, frequency, duration, options = {}) {
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = options.type || 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, frequency * (options.endRatio ?? 0.55)),
    now + duration,
  );
  gain.gain.setValueAtTime(options.gain ?? 0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

// Filtered white-noise burst with exponential amplitude envelope.
function noise(ctx, duration, options = {}) {
  if (!ctx) {
    return;
  }
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = options.filterType || 'bandpass';
  filter.frequency.value = options.frequency ?? 900;
  filter.Q.value = options.q ?? 0.9;
  gain.gain.value = options.gain ?? 0.05;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

// Low-frequency punch thump for weapon body.
function punch(ctx, frequency, duration, gainAmount = 0.16) {
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.4), now + duration);
  gain.gain.setValueAtTime(gainAmount, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

// External audio sample loader. Caches decoded AudioBuffers per key.
export function createAudioSampler() {
  const contextRef = { value: null };
  const manifestPromise = fetch(MANIFEST_URL, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  const cache = new Map();

  async function loadBuffer(url) {
    const ctx = ensureContext(contextRef);
    if (!ctx) {
      return null;
    }
    if (cache.has(url)) {
      return cache.get(url);
    }

    const promise = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((arrayBuffer) => (arrayBuffer ? ctx.decodeAudioData(arrayBuffer) : null))
      .catch(() => null);

    cache.set(url, promise);
    return promise;
  }

  async function getBuffer(weaponId, event) {
    const manifest = await manifestPromise;
    const entry = manifest?.[weaponId]?.[event] ?? manifest?.weapons?.[weaponId]?.[event];
    if (!entry) {
      return null;
    }
    const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const url = /^(https?:|data:|blob:)/.test(entry) ? entry : `${baseUrl}${entry.replace(/^\/+/, '')}`;
    return loadBuffer(url);
  }

  function playBuffer(ctx, buffer, options = {}) {
    if (!ctx || !buffer) {
      return false;
    }
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate ?? 1;
    gain.gain.value = options.gain ?? 1;
    source.connect(gain).connect(ctx.destination);
    source.start(now, options.offset ?? 0);
    return true;
  }

  return {
    async play(weaponId, event, options = {}) {
      const ctx = ensureContext(contextRef);
      if (!ctx) {
        return false;
      }
      const buffer = await getBuffer(weaponId, event);
      if (!buffer) {
        return false;
      }
      return playBuffer(ctx, buffer, options);
    },
    contextRef,
  };
}

export function createAudioKit({ sampler = null } = {}) {
  const contextRef = { value: null };

  function ctx() {
    return ensureContext(contextRef);
  }

  return {
    async shot(item) {
      const weaponId = item?.id;
      if (sampler && (await sampler.play(weaponId, 'fire', { gain: 0.9 }))) {
        return;
      }

      const c = ctx();
      if (item?.id === 'destroyer-sniper') {
        punch(c, 78, 0.42, 0.22);
        noise(c, 0.28, { gain: 0.2, frequency: 380, q: 0.4, filterType: 'lowpass' });
        noise(c, 0.06, { gain: 0.14, frequency: 2600, q: 0.7, filterType: 'highpass' });
        tone(c, 54, 0.34, { type: 'sawtooth', gain: 0.12, endRatio: 0.38 });
        window.setTimeout(() => tone(c, 132, 0.08, { type: 'square', gain: 0.045, endRatio: 1.18 }), 72);
        return;
      }
      if (item?.type === 'sniper') {
        punch(c, 88, 0.32, 0.18);
        noise(c, 0.2, { gain: 0.16, frequency: 480, q: 0.55, filterType: 'lowpass' });
        noise(c, 0.05, { gain: 0.1, frequency: 2400, q: 0.7, filterType: 'highpass' });
        tone(c, 74, 0.28, { type: 'sawtooth', gain: 0.09, endRatio: 0.45 });
        return;
      }
      // Rifle: body punch + mid noise + high crack.
      punch(c, 92, 0.16, 0.14);
      noise(c, 0.11, { gain: 0.12, frequency: 1200, q: 0.7 });
      noise(c, 0.04, { gain: 0.08, frequency: 3200, q: 0.8, filterType: 'highpass' });
      tone(c, 120, 0.12, { type: 'square', gain: 0.04, endRatio: 0.62 });
    },

    async knife() {
      if (sampler && (await sampler.play('knife', 'fire', { gain: 0.8 }))) {
        return;
      }
      const c = ctx();
      // Metallic whoosh + clink.
      noise(c, 0.12, { gain: 0.05, frequency: 1600, q: 1.4, filterType: 'bandpass' });
      noise(c, 0.05, { gain: 0.035, frequency: 4200, q: 1.2, filterType: 'highpass' });
      tone(c, 220, 0.08, { type: 'triangle', gain: 0.035, endRatio: 1.45 });
    },

    async equip(isMelee = false) {
      const c = ctx();
      // Mechanical switch click: two short clicks.
      noise(c, 0.03, { gain: 0.06, frequency: isMelee ? 2600 : 1800, q: 2.4, filterType: 'bandpass' });
      tone(c, isMelee ? 310 : 230, 0.055, { type: 'triangle', gain: 0.04, endRatio: isMelee ? 1.35 : 0.82 });
      window.setTimeout(() => {
        const cc = ctx();
        noise(cc, 0.025, { gain: 0.05, frequency: isMelee ? 3000 : 2200, q: 2.6, filterType: 'bandpass' });
        tone(cc, isMelee ? 470 : 285, 0.045, { type: 'square', gain: 0.025, endRatio: 0.74 });
      }, 58);
    },

    async inspect(itemId = null) {
      if (sampler && itemId && (await sampler.play(itemId, 'inspect', { gain: 0.8 }))) {
        return;
      }
      const c = ctx();
      // Mechanical click + short rising chime to mark the inspect flourish.
      noise(c, 0.04, { gain: 0.05, frequency: 2200, q: 2.2, filterType: 'bandpass' });
      tone(c, 440, 0.08, { type: 'triangle', gain: 0.04, endRatio: 1.4 });
      window.setTimeout(() => tone(c, 660, 0.1, { type: 'triangle', gain: 0.035, endRatio: 1.3 }), 90);
    },

    hit(eliminated = false) {
      const c = ctx();
      tone(c, eliminated ? 520 : 390, 0.09, { type: 'triangle', gain: eliminated ? 0.08 : 0.05, endRatio: 1.25 });
    },

    damage() {
      const c = ctx();
      punch(c, 90, 0.16, 0.1);
      tone(c, 90, 0.16, { type: 'sawtooth', gain: 0.08, endRatio: 0.55 });
    },

    reload() {
      const c = ctx();
      noise(c, 0.04, { gain: 0.05, frequency: 1400, q: 2.4, filterType: 'bandpass' });
      tone(c, 180, 0.06, { type: 'square', gain: 0.035, endRatio: 1.4 });
      window.setTimeout(() => {
        const cc = ctx();
        noise(cc, 0.04, { gain: 0.05, frequency: 1600, q: 2.4, filterType: 'bandpass' });
        tone(cc, 260, 0.06, { type: 'square', gain: 0.03, endRatio: 0.8 });
      }, 110);
    },
  };
}
