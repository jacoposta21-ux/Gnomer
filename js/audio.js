// Generated WebAudio sound effects (no files). The context is created on the first user gesture.
let ctx = null, master = null, muted = false, noiseBuf = null;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return !!ctx; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch { ctx = null; return false; }
}

function tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn); gn.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { freq = 1000, type = 'lowpass', vol = 0.2, delay = 0, sweep = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(50, freq + sweep), t0 + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(gn); gn.connect(master);
  src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
}

const SFX = {
  till: () => { noise(0.12, { freq: 500, vol: 0.35 }); tone(90, 0.1, { type: 'sine', vol: 0.2 }); },
  water: () => { noise(0.3, { freq: 1800, type: 'bandpass', vol: 0.25, sweep: -900 }); },
  swish: () => { noise(0.14, { freq: 3000, type: 'highpass', vol: 0.18, sweep: -2000 }); },
  plant: () => tone(500, 0.08, { type: 'sine', vol: 0.18, slide: 300 }),
  pickup: () => { tone(660, 0.07, { vol: 0.09 }); tone(990, 0.09, { vol: 0.09, delay: 0.06 }); },
  coin: () => { tone(988, 0.08, { type: 'triangle', vol: 0.2 }); tone(1319, 0.16, { type: 'triangle', vol: 0.2, delay: 0.07 }); },
  door: () => { noise(0.1, { freq: 300, vol: 0.3 }); tone(120, 0.12, { type: 'sine', vol: 0.2 }); },
  click: () => tone(800, 0.04, { vol: 0.06 }),
  error: () => tone(160, 0.15, { type: 'sawtooth', vol: 0.08, slide: -40 }),
  talk: (pitch = 1) => tone(320 * pitch * (0.9 + Math.random() * 0.2), 0.05, { vol: 0.05, type: 'square' }),
  clue: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.13, delay: i * 0.07 })); },
  gnome: () => { tone(700, 0.5, { type: 'triangle', vol: 0.16, slide: -500 }); tone(350, 0.6, { type: 'triangle', vol: 0.12, slide: -250, delay: 0.15 }); },
  sleep: () => { [392, 494, 587].forEach((f, i) => tone(f, 0.9, { type: 'sine', vol: 0.1, delay: i * 0.12, attack: 0.08 })); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.16, delay: i * 0.11 })); },
  lose: () => { [392, 370, 349, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.14, delay: i * 0.22 })); },
  heart: () => { tone(880, 0.1, { type: 'sine', vol: 0.12 }); tone(1175, 0.18, { type: 'sine', vol: 0.12, delay: 0.08 }); },
  charm: () => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.08, delay: i * 0.05 })); },
  caught: () => { tone(300, 0.2, { type: 'square', vol: 0.08 }); tone(220, 0.3, { type: 'square', vol: 0.08, delay: 0.15 }); },
};

export const Audio = {
  unlock() { ensure(); },
  play(name, arg) {
    if (muted || !SFX[name]) return;
    if (!ensure()) return;
    try { SFX[name](arg); } catch { /* audio must never break the game */ }
  },
  get muted() { return muted; },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  },
};
