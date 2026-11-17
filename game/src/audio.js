// All of Neon Harbor's sound is synthesised with WebAudio — no audio files.
// The context is created lazily on the first player gesture, as browsers ask.

let ctx = null;
let master = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let musicTimer = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    startMusicLoop();
  } catch {
    ctx = null;
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

function blip(freq, seconds, type, volume, slideTo) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
  osc.connect(gain).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + seconds);
}

function noiseBurst(seconds, volume, lowpassFreq) {
  if (!ctx || muted) return;
  const size = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpassFreq;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(master);
  source.start();
}

export function playPunch() { noiseBurst(0.08, 0.5, 900); }
export function playGunshot() { noiseBurst(0.16, 0.8, 2600); blip(140, 0.1, 'square', 0.25, 60); }
export function playHurt() { blip(220, 0.15, 'sawtooth', 0.3, 110); }
export function playPickup() { blip(660, 0.09, 'sine', 0.35); setTimeout(() => blip(990, 0.12, 'sine', 0.35), 70); }
export function playCash() { blip(880, 0.08, 'triangle', 0.4); setTimeout(() => blip(1320, 0.14, 'triangle', 0.4), 60); }
export function playDoor() { blip(180, 0.07, 'square', 0.3, 120); noiseBurst(0.05, 0.2, 700); }
export function playCrash(strength) { noiseBurst(0.22, Math.min(0.9, 0.3 + strength), 500); }
export function playObjective() { blip(523, 0.1, 'sine', 0.35); setTimeout(() => blip(784, 0.16, 'sine', 0.35), 90); }
export function playMissionDone() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.4), i * 110));
}
export function playBusted() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.3), i * 160)); }

// A lazy harbour-side bassline: two bars of low notes on a slow timer.
const BASSLINE = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
let bassStep = 0;
function startMusicLoop() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || muted) return;
    const note = BASSLINE[bassStep % BASSLINE.length];
    bassStep++;
    if (note) blip(note, 0.34, 'triangle', 0.16);
  }, 300);
}

export function setEngineSound(on, speedRatio) {
  if (!ctx) return;
  if (on && !engineOsc) {
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }
  if (engineOsc) {
    const target = on && !muted ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(60 + Math.abs(speedRatio) * 140, ctx.currentTime, 0.1);
  }
}

export function setSirenSound(on) {
  if (!ctx) return;
  if (on && !sirenOsc) {
    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();
    sirenOsc.type = 'triangle';
    sirenGain.gain.value = 0.0;
    const wail = ctx.createOscillator();
    const wailGain = ctx.createGain();
    wail.frequency.value = 0.55;
    wailGain.gain.value = 190;
    wail.connect(wailGain).connect(sirenOsc.frequency);
    sirenOsc.frequency.value = 760;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    wail.start();
    sirenOsc._wail = wail;
  }
  if (sirenOsc) {
    sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.15);
  }
}
