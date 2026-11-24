/**
 * Game audio, synthesized in the browser with the Web Audio API — no sound
 * files needed. Provides:
 *  - an original military march (brass melody, tuba oom-pah, snare and bass
 *    drum), played in a loop by the music player
 *  - battle sound effects for the cut scenes (rifle fire, artillery shells,
 *    explosions, aircraft)
 *
 * One AudioContext is created lazily on first use (browsers only allow audio
 * after the player has interacted with the page).
 */

type Note = [midi: number, eighths: number];

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let reverbSend: GainNode;
let noiseBuffer: AudioBuffer;

let volume = 0.4;
const listeners = new Set<() => void>();

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  // A soft hall reverb glues the band together and gives explosions a tail.
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.2, 3);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.22;
  reverbSend.connect(reverb).connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);
  musicBus.connect(reverbSend);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  sfxBus.connect(reverbSend);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Resume audio after a user gesture. Safe to call often. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

export function getVolume(): number {
  return volume;
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

function brass(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
) {
  const f = midiHz(midi);
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 2;
  // The "blat" of a brass attack: the filter opens quickly then settles.
  lp.frequency.setValueAtTime(f * 2, t);
  lp.frequency.linearRampToValueAtTime(f * 7, t + 0.04);
  lp.frequency.exponentialRampToValueAtTime(f * 4, t + 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.03);
  g.gain.exponentialRampToValueAtTime(level * 0.7, t + 0.15);
  g.gain.setValueAtTime(level * 0.7, t + Math.max(0.16, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  lp.connect(g).connect(out);
  for (const detune of [-6, 6]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = detune;
    // Gentle vibrato on long notes.
    if (dur > 0.5) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(7, t + dur);
      lfo.connect(depth).connect(o.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

function tuba(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
) {
  const f = midiHz(midi);
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g).connect(out);
  for (const type of ["sawtooth", "sine"] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

function pah(c: AudioContext, midis: number[], t: number, level: number, out: AudioNode) {
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  lp.connect(g).connect(out);
  for (const m of midis) {
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = midiHz(m);
    o.connect(lp);
    o.start(t);
    o.stop(t + 0.2);
  }
}

function noise(c: AudioContext, t: number, dur: number): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const offset = Math.random() * (noiseBuffer.duration - dur - 0.1);
  src.start(t, Math.max(0, offset), dur + 0.05);
  return src;
}

function snare(c: AudioContext, t: number, level: number, out: AudioNode) {
  const n = noise(c, t, 0.18);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  n.connect(hp).connect(g).connect(out);
  const body = c.createOscillator();
  const bg = c.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(200, t);
  body.frequency.exponentialRampToValueAtTime(150, t + 0.06);
  bg.gain.setValueAtTime(level * 0.6, t);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  body.connect(bg).connect(out);
  body.start(t);
  body.stop(t + 0.1);
}

function kick(c: AudioContext, t: number, level: number, out: AudioNode, low = 48) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(low, t + 0.14);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.4);
}

function cymbal(c: AudioContext, t: number, level: number, out: AudioNode) {
  const n = noise(c, t, 1.3);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  n.connect(hp).connect(g).connect(out);
}

// ---------------------------------------------------------------------------
// The march — an original composition, "Campaign March", in 2/4.
// Each bar is 4 eighth notes. Strain in C, trio in F, then da capo.
// ---------------------------------------------------------------------------

const STRAIN: Note[][] = [
  [
    [67, 2],
    [72, 1],
    [76, 1],
  ],
  [
    [79, 3],
    [76, 1],
  ],
  [
    [77, 1],
    [76, 1],
    [74, 1],
    [72, 1],
  ],
  [[74, 4]],
  [
    [67, 2],
    [71, 1],
    [74, 1],
  ],
  [
    [77, 3],
    [74, 1],
  ],
  [
    [76, 1],
    [74, 1],
    [72, 1],
    [71, 1],
  ],
  [[72, 4]],
  [
    [76, 2],
    [79, 1],
    [76, 1],
  ],
  [
    [84, 3],
    [81, 1],
  ],
  [
    [79, 1],
    [77, 1],
    [76, 1],
    [74, 1],
  ],
  [
    [76, 2],
    [72, 2],
  ],
  [
    [74, 1],
    [76, 1],
    [77, 1],
    [74, 1],
  ],
  [
    [79, 2],
    [71, 2],
  ],
  [
    [72, 1],
    [67, 1],
    [64, 1],
    [67, 1],
  ],
  [[72, 4]],
];
const STRAIN_CHORDS = "C C G G G G G C C F C C G G C C".split(" ");

const TRIO: Note[][] = [
  [
    [69, 3],
    [72, 1],
  ],
  [[77, 4]],
  [
    [76, 1],
    [74, 1],
    [72, 1],
    [70, 1],
  ],
  [[69, 4]],
  [
    [67, 3],
    [70, 1],
  ],
  [[76, 4]],
  [
    [74, 1],
    [72, 1],
    [70, 1],
    [67, 1],
  ],
  [[65, 4]],
  [
    [69, 3],
    [72, 1],
  ],
  [[77, 4]],
  [
    [76, 1],
    [74, 1],
    [72, 1],
    [70, 1],
  ],
  [[69, 4]],
  [
    [70, 2],
    [74, 2],
  ],
  [
    [72, 3],
    [69, 1],
  ],
  [
    [67, 1],
    [69, 1],
    [70, 1],
    [67, 1],
  ],
  [[65, 4]],
];
const TRIO_CHORDS = "F F C F C C C F F F C F Bb F C F".split(" ");

const CHORD_TONES: Record<string, { root: number; fifth: number; triad: number[] }> = {
  C: { root: 36, fifth: 43, triad: [60, 64, 67] },
  F: { root: 41, fifth: 36, triad: [60, 65, 69] },
  G: { root: 43, fifth: 38, triad: [59, 62, 67] },
  Bb: { root: 46, fifth: 41, triad: [58, 62, 65] },
};

const BARS: { melody: Note[]; chord: string; phraseStart: boolean; trio: boolean }[] = [
  ...STRAIN.map((m, i) => ({
    melody: m,
    chord: STRAIN_CHORDS[i],
    phraseStart: i % 8 === 0,
    trio: false,
  })),
  ...STRAIN.map((m, i) => ({
    melody: m,
    chord: STRAIN_CHORDS[i],
    phraseStart: i % 8 === 0,
    trio: false,
  })),
  ...TRIO.map((m, i) => ({
    melody: m,
    chord: TRIO_CHORDS[i],
    phraseStart: i % 8 === 0,
    trio: true,
  })),
];

const TEMPO = 116; // quarter notes per minute
const EIGHTH = 60 / TEMPO / 2;
const TRANSPOSE = -2; // concert B-flat, like a real band march

let marchTimer: number | null = null;
let nextBar = 0;
let nextBarTime = 0;
let marchGain: GainNode | null = null;

function scheduleBar(c: AudioContext, barIndex: number, t: number, out: AudioNode) {
  const bar = BARS[barIndex];
  const chord = CHORD_TONES[bar.chord];
  const lead = bar.trio ? 0.11 : 0.14;
  // Melody (plus a horn an octave down for weight).
  let at = t;
  for (const [midi, len] of bar.melody) {
    const dur = len * EIGHTH * 0.92;
    brass(c, midi + TRANSPOSE, at, dur, lead, out);
    brass(c, midi + TRANSPOSE - 12, at, dur, lead * 0.45, out);
    at += len * EIGHTH;
  }
  // Tuba on the beats, offbeat chords on the "ands".
  tuba(c, chord.root + TRANSPOSE, t, EIGHTH * 1.5, 0.32, out);
  tuba(c, chord.fifth + TRANSPOSE, t + EIGHTH * 2, EIGHTH * 1.5, 0.28, out);
  const triad = chord.triad.map((m) => m + TRANSPOSE);
  pah(c, triad, t + EIGHTH, 0.05, out);
  pah(c, triad, t + EIGHTH * 3, 0.05, out);
  // Drums.
  kick(c, t, 0.55, out);
  kick(c, t + EIGHTH * 2, 0.4, out);
  const s = bar.trio ? 0.12 : 0.18;
  snare(c, t + EIGHTH, s, out);
  snare(c, t + EIGHTH * 2.5, s * 0.6, out);
  snare(c, t + EIGHTH * 3, s, out);
  const lastOfPhrase = barIndex % 8 === 7;
  if (lastOfPhrase) {
    // A snare roll into the next phrase.
    for (let i = 0; i < 8; i++)
      snare(c, t + EIGHTH * 2 + (i * EIGHTH) / 4, s * (0.4 + i * 0.07), out);
  }
  if (bar.phraseStart) cymbal(c, t, 0.12, out);
}

export function isMarchPlaying(): boolean {
  return marchTimer !== null;
}

export function startMarch(): void {
  const c = getCtx();
  if (!c || marchTimer !== null) return;
  unlockAudio();
  marchGain = c.createGain();
  marchGain.gain.value = 1;
  marchGain.connect(musicBus);
  nextBar = 0;
  nextBarTime = c.currentTime + 0.12;
  const tick = () => {
    if (!marchGain) return;
    // Schedule a little ahead so timing stays tight even if the tab is busy.
    while (nextBarTime < c.currentTime + 0.6) {
      scheduleBar(c, nextBar, nextBarTime, marchGain);
      nextBarTime += EIGHTH * 4;
      nextBar = (nextBar + 1) % BARS.length;
    }
  };
  tick();
  marchTimer = window.setInterval(tick, 100);
  notify();
}

export function stopMarch(): void {
  if (marchTimer !== null) window.clearInterval(marchTimer);
  marchTimer = null;
  if (ctx && marchGain) {
    const g = marchGain;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    window.setTimeout(() => g.disconnect(), 800);
  }
  marchGain = null;
  notify();
}

/** Lower the music while a battle plays, then bring it back. */
export function duckMusic(seconds: number): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.18, t, 0.1);
  musicBus.gain.setTargetAtTime(0.55, t + seconds, 0.4);
}

function notify() {
  for (const l of listeners) l();
}

export function onMusicChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Battle sound effects
// ---------------------------------------------------------------------------

function sfxReady(): AudioContext | null {
  const c = getCtx();
  if (!c || c.state !== "running") return null;
  return c;
}

/** A crack of rifle or machine-gun fire. */
export function sfxGunshot(delay = 0, level = 0.35): void {
  const c = sfxReady();
  if (!c) return;
  const t = c.currentTime + delay;
  const n = noise(c, t, 0.12);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400 + Math.random() * 1200;
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  n.connect(bp).connect(g).connect(pan).connect(sfxBus);
}

/** A machine-gun burst of several shots. */
export function sfxBurst(delay = 0, shots = 5): void {
  for (let i = 0; i < shots; i++) sfxGunshot(delay + i * 0.075, 0.22 + Math.random() * 0.1);
}

/** An explosion: a low boom with a noisy crack and rumble. */
export function sfxExplosion(delay = 0, size = 1): void {
  const c = sfxReady();
  if (!c) return;
  const t = c.currentTime + delay;
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - 0.7;
  pan.connect(sfxBus);
  kick(c, t, 0.9 * size, pan, 30);
  const n = noise(c, t, 1.4);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3500, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 1.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.75 * size, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3 * Math.max(0.6, size));
  n.connect(lp).connect(g).connect(pan);
}

/** An incoming shell's whistle, ending in an explosion. */
export function sfxShell(delay = 0): void {
  const c = sfxReady();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1500, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + 0.75);
  sfxExplosion(delay + 0.7, 0.8);
}

/** Aircraft passing overhead. */
export function sfxFlyby(delay = 0, seconds = 2.2): void {
  const c = sfxReady();
  if (!c) return;
  const t = c.currentTime + delay;
  const n = noise(c, t, seconds);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.linearRampToValueAtTime(900, t + seconds * 0.5);
  bp.frequency.linearRampToValueAtTime(250, t + seconds);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + seconds * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  const pan = c.createStereoPanner();
  pan.pan.setValueAtTime(-0.9, t);
  pan.pan.linearRampToValueAtTime(0.9, t + seconds);
  n.connect(bp).connect(g).connect(pan).connect(sfxBus);
}

/** A bugle-like fanfare that opens a battle. */
export function sfxCharge(delay = 0): void {
  const c = sfxReady();
  if (!c) return;
  const t = c.currentTime + delay;
  const notes: Note[] = [
    [67, 1],
    [72, 1],
    [76, 1],
    [79, 3],
  ];
  let at = t;
  for (const [m, len] of notes) {
    brass(c, m, at, len * 0.11, 0.16, sfxBus);
    at += len * 0.12;
  }
}
