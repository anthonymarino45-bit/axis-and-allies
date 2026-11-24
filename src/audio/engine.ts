/**
 * Game audio, synthesized in the browser with the Web Audio API — no sound
 * files needed. Provides:
 *  - a jukebox for a WW2-era soundtrack (songs.ts): a brass-band march, a big-band
 *    swing number and a fife-and-drum field march, played through a
 *    "78 rpm gramophone" chain — narrow 1940s frequency range, a touch of
 *    tube warmth, wow and flutter, and vinyl crackle
 *  - battle sound effects for the cut scenes (rifle fire, artillery shells,
 *    explosions, aircraft)
 *
 * One AudioContext is created lazily on first use (browsers only allow audio
 * after the player has interacted with the page).
 */

export type Note = [midi: number, eighths: number];

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let reverbSend: GainNode;
let noiseBuffer: AudioBuffer;
let crackleBuffer: AudioBuffer;
/** Slow pitch wobble shared by every music oscillator (record wow & flutter). */
let wow: GainNode | null = null;

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
  // A limiter keeps explosions over the music from distorting.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.2, 3);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.22;
  reverbSend.connect(reverb).connect(master);

  // ---- The gramophone: everything the band plays passes through this ----
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.6;
  const warmth = ctx.createWaveShaper();
  warmth.curve = saturationCurve(2.2);
  warmth.oversample = "2x";
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = 180;
  lowCut.Q.value = 0.9;
  const horn = ctx.createBiquadFilter();
  horn.type = "peaking";
  horn.frequency.value = 1500;
  horn.Q.value = 0.8;
  horn.gain.value = 5;
  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 3800;
  highCut.Q.value = 0.7;
  const highCut2 = ctx.createBiquadFilter();
  highCut2.type = "lowpass";
  highCut2.frequency.value = 5200;
  const record = ctx.createGain();
  record.gain.value = 1.15;
  musicBus
    .connect(warmth)
    .connect(lowCut)
    .connect(horn)
    .connect(highCut)
    .connect(highCut2)
    .connect(record);
  record.connect(master);
  const room = ctx.createGain();
  room.gain.value = 0.5;
  record.connect(room).connect(reverbSend);

  // Wow (slow) and flutter (fast) pitch wobble, in cents.
  wow = ctx.createGain();
  wow.gain.value = 1;
  const slow = ctx.createOscillator();
  const slowDepth = ctx.createGain();
  slow.frequency.value = 0.55;
  slowDepth.gain.value = 7;
  slow.connect(slowDepth).connect(wow);
  const fast = ctx.createOscillator();
  const fastDepth = ctx.createGain();
  fast.frequency.value = 6.3;
  fastDepth.gain.value = 2.5;
  fast.connect(fastDepth).connect(wow);
  slow.start();
  fast.start();

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  sfxBus.connect(reverbSend);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  crackleBuffer = makeCrackle(ctx, 6);
  return ctx;
}

function saturationCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/** Surface noise of a worn shellac record: soft hiss, ticks and the odd pop. */
function makeCrackle(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let hiss = 0;
  for (let i = 0; i < len; i++) {
    hiss = hiss * 0.82 + (Math.random() * 2 - 1) * 0.18;
    d[i] = hiss * 0.05;
  }
  const ticks = seconds * 22;
  for (let k = 0; k < ticks; k++) {
    const at = Math.floor(Math.random() * (len - 200));
    const big = Math.random() < 0.06;
    const amp = (big ? 0.7 : 0.18 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1);
    const width = big ? 60 : 6 + Math.floor(Math.random() * 10);
    for (let j = 0; j < width; j++) d[at + j] += amp * Math.exp(-j / (width / 3));
  }
  // A faint once-per-revolution thump (78 rpm ≈ 1.3 Hz).
  const rev = Math.floor(c.sampleRate / 1.3);
  for (let at = 0; at < len - 400; at += rev) {
    for (let j = 0; j < 400; j++)
      d[at + j] += 0.05 * Math.sin((j / 400) * Math.PI) * Math.sin(j * 0.05);
  }
  return buf;
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

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// Instruments (exported for songs.ts). Each schedules one note at time t.
// ---------------------------------------------------------------------------

function osc(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  t: number,
  stop: number,
  out: AudioNode,
  detune = 0,
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  if (wow) wow.connect(o.detune);
  o.connect(out);
  o.start(t);
  o.stop(stop);
  o.onended = () => {
    try {
      wow?.disconnect(o.detune);
    } catch {
      // already disconnected
    }
  };
  return o;
}

function env(
  c: AudioContext,
  t: number,
  attack: number,
  peak: number,
  sustain: number,
  dur: number,
  release: number,
  out: AudioNode,
) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, sustain), t + attack + 0.12);
  g.gain.setValueAtTime(Math.max(0.0002, sustain), t + Math.max(attack + 0.13, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  g.connect(out);
  return g;
}

function vibrato(
  c: AudioContext,
  o: OscillatorNode,
  t: number,
  dur: number,
  rate: number,
  cents: number,
) {
  if (dur < 0.35) return;
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = rate;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + Math.min(dur, 0.6));
  lfo.connect(depth).connect(o.detune);
  lfo.start(t);
  lfo.stop(t + dur + 0.2);
}

/** Trumpet / cornet / trombone. `bright` opens the bell; `mute` is a cup mute. */
export function brass(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
  opts: { bright?: number; mute?: boolean; fall?: boolean } = {},
) {
  const f = midiHz(midi);
  const bright = opts.bright ?? 1;
  const g = env(c, t, 0.025, level, level * 0.72, dur, 0.07, out);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = opts.mute ? 6 : 2;
  lp.frequency.setValueAtTime(f * 1.8, t);
  lp.frequency.linearRampToValueAtTime(f * 6 * bright, t + 0.04);
  lp.frequency.exponentialRampToValueAtTime(f * (opts.mute ? 2.5 : 3.6) * bright, t + 0.25);
  lp.connect(g);
  for (const d of [-7, 6]) {
    const o = osc(c, "sawtooth", f, t, t + dur + 0.12, lp, d);
    // A little scoop up into the note, like a real player.
    o.detune.setValueAtTime(d - 25, t);
    o.detune.linearRampToValueAtTime(d, t + 0.05);
    if (opts.fall) o.detune.linearRampToValueAtTime(d - 300, t + dur + 0.1);
    vibrato(c, o, t, dur, 5.4, 9);
  }
}

/** Clarinet / saxophone section: hollow square tone with breathy vibrato. */
export function reed(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
  sax = true,
) {
  const f = midiHz(midi);
  const g = env(c, t, 0.04, level, level * 0.8, dur, 0.08, out);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = f * (sax ? 4.5 : 3);
  lp.Q.value = 1.2;
  lp.connect(g);
  const a = osc(c, "square", f, t, t + dur + 0.12, lp, -4);
  vibrato(c, a, t, dur, 5, 14);
  if (sax) {
    const b = osc(c, "sawtooth", f, t, t + dur + 0.12, lp, 5);
    vibrato(c, b, t, dur, 5, 14);
  }
  // Breath.
  const n = noiseSrc(c, t, dur);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f * 3;
  const ng = c.createGain();
  ng.gain.value = level * 0.15;
  n.connect(bp).connect(ng).connect(g);
}

/** Fife / piccolo: a breathy, slightly wild pure tone. */
export function fife(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
) {
  const f = midiHz(midi);
  const g = env(c, t, 0.03, level, level * 0.85, dur, 0.05, out);
  const a = osc(c, "triangle", f, t, t + dur + 0.1, g, 0);
  vibrato(c, a, t, dur, 6, 12);
  const h = c.createGain();
  h.gain.value = 0.25;
  h.connect(g);
  osc(c, "sine", f * 2, t, t + dur + 0.1, h);
  const n = noiseSrc(c, t, dur);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f * 2;
  bp.Q.value = 3;
  const ng = c.createGain();
  ng.gain.value = level * 0.5;
  n.connect(bp).connect(ng).connect(g);
}

/** Sousaphone / tuba. */
export function tuba(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
) {
  const f = midiHz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.025);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 650;
  lp.connect(g).connect(out);
  osc(c, "sawtooth", f, t, t + dur + 0.05, lp);
  osc(c, "sine", f, t, t + dur + 0.05, lp);
}

/** Upright bass, plucked. */
export function pluck(
  c: AudioContext,
  midi: number,
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
) {
  const f = midiHz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.008);
  g.gain.exponentialRampToValueAtTime(level * 0.35, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(380, t + 0.15);
  lp.connect(g).connect(out);
  // The bass sits an octave above its true pitch so a 1940s record can carry it.
  osc(c, "triangle", f * 2, t, t + dur + 0.05, lp);
  osc(c, "sawtooth", f * 2, t, t + dur + 0.05, lp, 3);
}

/** Short chord stab (rhythm guitar / band "pah"). */
export function stab(
  c: AudioContext,
  midis: number[],
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
  tone = 1600,
) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = tone;
  lp.connect(g).connect(out);
  for (const m of midis)
    osc(c, "square", midiHz(m), t, t + dur + 0.05, lp, (Math.random() - 0.5) * 8);
}

/** Sustained horn-section pad. */
export function horns(
  c: AudioContext,
  midis: number[],
  t: number,
  dur: number,
  level: number,
  out: AudioNode,
) {
  for (const m of midis) brass(c, m, t, dur, level, out, { bright: 0.55 });
}

export function noiseSrc(c: AudioContext, t: number, dur: number): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const offset = Math.random() * (noiseBuffer.duration - dur - 0.1);
  src.start(t, Math.max(0, offset), dur + 0.05);
  return src;
}

export function snare(c: AudioContext, t: number, level: number, out: AudioNode, brush = false) {
  const n = noiseSrc(c, t, brush ? 0.3 : 0.18);
  const hp = c.createBiquadFilter();
  hp.type = brush ? "bandpass" : "highpass";
  hp.frequency.value = brush ? 3000 : 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (brush ? 0.22 : 0.14));
  n.connect(hp).connect(g).connect(out);
  if (brush) return;
  const body = c.createOscillator();
  const bg = c.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(220, t);
  body.frequency.exponentialRampToValueAtTime(160, t + 0.06);
  bg.gain.setValueAtTime(level * 0.6, t);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  body.connect(bg).connect(out);
  body.start(t);
  body.stop(t + 0.1);
}

/** A press roll on the snare, crescendo from `from` to `to` level. */
export function roll(
  c: AudioContext,
  t: number,
  dur: number,
  from: number,
  to: number,
  out: AudioNode,
) {
  const strokes = Math.max(4, Math.floor(dur / 0.035));
  for (let i = 0; i < strokes; i++)
    snare(c, t + (i * dur) / strokes, from + ((to - from) * i) / strokes, out);
}

export function kick(c: AudioContext, t: number, level: number, out: AudioNode, low = 48) {
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

/** Field bass drum: deeper, with a felt-beater thud. */
export function bassDrum(c: AudioContext, t: number, level: number, out: AudioNode) {
  kick(c, t, level, out, 40);
  const n = noiseSrc(c, t, 0.08);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  const g = c.createGain();
  g.gain.setValueAtTime(level * 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  n.connect(lp).connect(g).connect(out);
}

export function cymbal(c: AudioContext, t: number, level: number, out: AudioNode, length = 1.2) {
  const n = noiseSrc(c, t, length + 0.1);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5500;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  n.connect(hp).connect(g).connect(out);
}

/** Ride cymbal "ting" for swing time. */
export function ride(c: AudioContext, t: number, level: number, out: AudioNode) {
  const n = noiseSrc(c, t, 0.5);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 7000;
  bp.Q.value = 1.5;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  n.connect(bp).connect(g).connect(out);
  const bell = c.createOscillator();
  const bg = c.createGain();
  bell.frequency.value = 3400;
  bg.gain.setValueAtTime(level * 0.12, t);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  bell.connect(bg).connect(out);
  bell.start(t);
  bell.stop(t + 0.32);
}

/** Closed hi-hat "chick". */
export function hat(c: AudioContext, t: number, level: number, out: AudioNode) {
  const n = noiseSrc(c, t, 0.06);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(hp).connect(g).connect(out);
}

// ---------------------------------------------------------------------------
// The jukebox: plays the playlist in turn through the gramophone chain
// ---------------------------------------------------------------------------

export interface Song {
  name: string;
  /** Number of bars before moving to the next song. */
  bars: number;
  /** Length of bar `i` in seconds. */
  barLength: (i: number) => number;
  /** Relative loudness, so every record plays at a similar level. */
  level: number;
  /** Schedule everything in bar `i`, which starts at time t. */
  play: (c: AudioContext, i: number, t: number, out: AudioNode) => void;
}

let timer: number | null = null;
let songIndex = 0;
let playlist: Song[] = [];
let bar = 0;
let barTime = 0;
let songGain: GainNode | null = null;
let songOuts: GainNode[] = [];
let crackle: AudioBufferSourceNode | null = null;

export function isMarchPlaying(): boolean {
  return timer !== null;
}

export function currentSongName(): string {
  return playlist[songIndex]?.name ?? "";
}

/** Load the records the jukebox plays, in order. */
export function setPlaylist(songs: Song[]): void {
  playlist = songs;
  songIndex = 0;
}

export function startMarch(): void {
  const c = getCtx();
  if (!c || timer !== null || playlist.length === 0) return;
  unlockAudio();
  songGain = c.createGain();
  songGain.gain.value = 1;
  songGain.connect(musicBus);
  songOuts = playlist.map((s) => {
    const g = c.createGain();
    g.gain.value = s.level;
    g.connect(songGain!);
    return g;
  });
  crackle = c.createBufferSource();
  crackle.buffer = crackleBuffer;
  crackle.loop = true;
  const crackleGain = c.createGain();
  crackleGain.gain.value = 0.4;
  const crackleTone = c.createBiquadFilter();
  crackleTone.type = "lowpass";
  crackleTone.frequency.value = 6000;
  crackle.connect(crackleTone).connect(crackleGain).connect(songGain);
  crackle.start();
  bar = 0;
  barTime = c.currentTime + 0.35;
  const tick = () => {
    if (!songGain) return;
    // Schedule a little ahead so timing stays tight even if the tab is busy.
    while (barTime < c.currentTime + 0.7) {
      const song = playlist[songIndex];
      song.play(c, bar, barTime, songOuts[songIndex]);
      barTime += song.barLength(bar);
      bar++;
      if (bar >= song.bars) {
        // Needle lifts, next record.
        bar = 0;
        barTime += 1.4;
        songIndex = (songIndex + 1) % playlist.length;
        window.setTimeout(notify, Math.max(0, (barTime - c.currentTime) * 1000));
      }
    }
  };
  tick();
  timer = window.setInterval(tick, 100);
  notify();
}

export function stopMarch(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (ctx && songGain) {
    const g = songGain;
    const cr = crackle;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    window.setTimeout(() => {
      g.disconnect();
      try {
        cr?.stop();
      } catch {
        // already stopped
      }
    }, 800);
  }
  songGain = null;
  crackle = null;
  notify();
}

/** Skip to the next song. */
export function nextSong(): void {
  const playing = timer !== null;
  if (playing) stopMarch();
  songIndex = (songIndex + 1) % Math.max(1, playlist.length);
  if (playing) window.setTimeout(startMarch, 250);
  else notify();
}

/** Lower the music while a battle plays, then bring it back. */
export function duckMusic(seconds: number): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.2, t, 0.1);
  musicBus.gain.setTargetAtTime(0.6, t + seconds, 0.4);
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
  const n = noiseSrc(c, t, 0.12);
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
  const n = noiseSrc(c, t, 1.4);
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
  const n = noiseSrc(c, t, seconds);
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
