/**
 * The soundtrack: three original pieces in WW2-era styles, played in turn by
 * the jukebox in engine.ts (which runs them through a gramophone chain).
 *
 *  1. "Campaign March"  — Sousa-style brass-band march (2/4)
 *  2. "Canteen Swing"   — 1940s big-band swing, the sound of a USO dance (4/4)
 *  3. "Over the Ridge"  — solemn fife-and-drum field march in A minor (6/8)
 *
 * Melodies are written as [midi note, length in eighth notes]; a midi of -1
 * is a rest.
 */
import {
  bassDrum,
  brass,
  cymbal,
  fife,
  hat,
  horns,
  kick,
  pluck,
  reed,
  ride,
  roll,
  snare,
  stab,
  tuba,
  type Note,
  type Song,
} from "./engine";

/** Play a melody line starting at time t; `at(pos)` maps an eighth-note position to seconds. */
function line(
  notes: Note[],
  at: (pos: number) => number,
  t: number,
  play: (midi: number, start: number, dur: number) => void,
) {
  let pos = 0;
  for (const [midi, len] of notes) {
    if (midi >= 0) play(midi, t + at(pos), at(pos + len) - at(pos));
    pos += len;
  }
}

// ===========================================================================
// 1. Campaign March — brass band in B-flat, 2/4
// ===========================================================================

const MARCH_EIGHTH = 60 / 118 / 2;
const straight = (pos: number) => pos * MARCH_EIGHTH;

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
/** Trombone countermelody for the second strain: long notes moving under the tune. */
const TROMBONE: Note[][] = [
  [[52, 4]],
  [[55, 4]],
  [
    [59, 2],
    [57, 2],
  ],
  [[55, 4]],
  [[53, 4]],
  [[50, 4]],
  [
    [53, 2],
    [55, 2],
  ],
  [[52, 4]],
  [[55, 4]],
  [[57, 4]],
  [
    [55, 2],
    [53, 2],
  ],
  [[52, 4]],
  [
    [53, 2],
    [55, 2],
  ],
  [
    [57, 2],
    [55, 2],
  ],
  [
    [52, 2],
    [50, 2],
  ],
  [[48, 4]],
];

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

const MARCH_CHORDS: Record<string, { root: number; fifth: number; triad: number[] }> = {
  C: { root: 36, fifth: 43, triad: [60, 64, 67] },
  F: { root: 41, fifth: 36, triad: [60, 65, 69] },
  G: { root: 43, fifth: 38, triad: [59, 62, 67] },
  Bb: { root: 46, fifth: 41, triad: [58, 62, 65] },
};

type MarchBar =
  | { kind: "cadence"; n: number }
  | { kind: "tune"; melody: Note[]; chord: string; trio: boolean; second: boolean; index: number }
  | { kind: "stinger" };

const MARCH_FORM: MarchBar[] = [
  { kind: "cadence", n: 0 },
  { kind: "cadence", n: 1 },
  ...STRAIN.map((m, i) => ({
    kind: "tune" as const,
    melody: m,
    chord: STRAIN_CHORDS[i],
    trio: false,
    second: false,
    index: i,
  })),
  ...STRAIN.map((m, i) => ({
    kind: "tune" as const,
    melody: m,
    chord: STRAIN_CHORDS[i],
    trio: false,
    second: true,
    index: i,
  })),
  ...TRIO.map((m, i) => ({
    kind: "tune" as const,
    melody: m,
    chord: TRIO_CHORDS[i],
    trio: true,
    second: false,
    index: i,
  })),
  { kind: "stinger" },
];

const T = -2; // written in C, sounding in concert B-flat like a real band

const campaignMarch: Song = {
  name: "Campaign March",
  level: 0.85,
  bars: MARCH_FORM.length,
  barLength: () => MARCH_EIGHTH * 4,
  play(c, i, t, out) {
    const bar = MARCH_FORM[i];
    const e = MARCH_EIGHTH;
    if (bar.kind === "cadence") {
      // Drum-line introduction: bass drum on the beat, a roll into the band.
      bassDrum(c, t, 0.6, out);
      bassDrum(c, t + e * 2, 0.45, out);
      if (bar.n === 0) {
        snare(c, t + e, 0.2, out);
        snare(c, t + e * 1.5, 0.12, out);
        snare(c, t + e * 3, 0.2, out);
      } else roll(c, t, e * 4, 0.05, 0.3, out);
      return;
    }
    if (bar.kind === "stinger") {
      // Final chord: "ta-DA".
      const chord = [53, 57, 60, 65, 69].map((m) => m + T);
      for (const m of chord) brass(c, m, t, e * 0.7, 0.05, out);
      for (const m of chord) brass(c, m, t + e * 2, e * 5, 0.06, out, { bright: 1.2 });
      tuba(c, 29 + T + 12, t + e * 2, e * 5, 0.35, out);
      bassDrum(c, t + e * 2, 0.7, out);
      cymbal(c, t + e * 2, 0.22, out, 2.2);
      return;
    }
    const chord = MARCH_CHORDS[bar.chord];
    const lead = bar.trio ? 0.085 : 0.11;
    line(bar.melody, straight, t, (m, s, d) => {
      if (bar.trio) {
        // Trio: the clarinets take the tune, softly, with a cornet underneath.
        reed(c, m + T, s, d * 0.95, 0.08, out, false);
        brass(c, m + T - 12, s, d * 0.9, 0.04, out, { bright: 0.6 });
      } else {
        brass(c, m + T, s, d * 0.88, lead, out, { bright: 1.1 });
        brass(c, m + T - 12, s, d * 0.88, lead * 0.4, out, { bright: 0.7 });
        if (bar.second) reed(c, m + T + 12, s, d * 0.85, 0.035, out, false);
      }
    });
    if (bar.second) {
      line(TROMBONE[bar.index], straight, t, (m, s, d) =>
        brass(c, m + T + 12, s, d * 0.95, 0.05, out, { bright: 0.7 }),
      );
    }
    // Sousaphone on the beats, band "pah" on the offbeats.
    tuba(c, chord.root + T + 12, t, e * 1.5, 0.3, out);
    tuba(c, chord.fifth + T + 12, t + e * 2, e * 1.5, 0.26, out);
    const triad = chord.triad.map((m) => m + T);
    stab(c, triad, t + e, 0.16, 0.035, out, 1500);
    stab(c, triad, t + e * 3, 0.16, 0.035, out, 1500);
    // Drums: bass drum on the beat, snare on the offbeats with a flam.
    bassDrum(c, t, 0.5, out);
    bassDrum(c, t + e * 2, 0.35, out);
    const s = bar.trio ? 0.1 : 0.16;
    snare(c, t + e - 0.02, s * 0.4, out);
    snare(c, t + e, s, out);
    snare(c, t + e * 2.5, s * 0.5, out);
    snare(c, t + e * 3, s, out);
    if (bar.index % 8 === 7) roll(c, t + e * 2, e * 2, s * 0.3, s * 1.3, out);
    if (bar.index % 8 === 0) cymbal(c, t, bar.trio ? 0.07 : 0.11, out);
  },
};

// ===========================================================================
// 2. Canteen Swing — big band, B-flat blues, swung 4/4
// ===========================================================================

const SWING_Q = 60 / 168;
const SWING = 0.64;
const swung = (pos: number) => {
  const beat = Math.floor(pos / 2);
  const off = pos - beat * 2;
  return (
    beat * SWING_Q +
    (off >= 1 ? SWING * SWING_Q + (off - 1) * (1 - SWING) * SWING_Q : off * SWING * SWING_Q)
  );
};

const BLUES = "Bb7 Bb7 Bb7 Bb7 Eb7 Eb7 Bb7 Bb7 F7 Eb7 Bb7 F7".split(" ");
const SWING_CHORDS: Record<
  string,
  { root: number; offset: number; voicing: number[]; pad: number[] }
> = {
  Bb7: { root: 34, offset: 0, voicing: [62, 65, 68, 70], pad: [62, 68] },
  Eb7: { root: 39, offset: 5, voicing: [61, 63, 67, 70], pad: [61, 67] },
  F7: { root: 41, offset: 7, voicing: [63, 65, 69, 72], pad: [63, 69] },
};
/** The sax-section riff, relative to the chord's root. */
const RIFF = [0, 4, 7, 9, 10, 9, 7, 4];
const TRUMPET_TUNE: Note[][] = [
  [
    [77, 2],
    [74, 1],
    [77, 3],
    [79, 2],
  ],
  [
    [77, 6],
    [-1, 2],
  ],
  [
    [74, 1],
    [77, 1],
    [79, 1],
    [80, 1],
    [79, 2],
    [77, 2],
  ],
  [
    [74, 6],
    [-1, 2],
  ],
  [
    [79, 2],
    [77, 1],
    [79, 3],
    [82, 2],
  ],
  [
    [80, 6],
    [-1, 2],
  ],
  [
    [77, 2],
    [74, 1],
    [77, 1],
    [79, 2],
    [77, 2],
  ],
  [
    [74, 4],
    [70, 4],
  ],
  [
    [72, 2],
    [75, 2],
    [77, 2],
    [80, 2],
  ],
  [
    [79, 3],
    [77, 1],
    [75, 2],
    [73, 2],
  ],
  [
    [74, 2],
    [70, 2],
    [72, 1],
    [74, 3],
  ],
  [
    [72, 6],
    [-1, 2],
  ],
];

type SwingBar = {
  part: "intro" | "riff" | "tune" | "shout" | "end";
  n: number;
  chord: string;
  next: string;
};
const SWING_FORM: SwingBar[] = [];
for (let n = 0; n < 4; n++)
  SWING_FORM.push({
    part: "intro",
    n,
    chord: n < 2 ? "Bb7" : n === 2 ? "Bb7" : "F7",
    next: n === 3 ? "Bb7" : "Bb7",
  });
for (const part of ["riff", "tune", "shout"] as const) {
  BLUES.forEach((chord, n) => SWING_FORM.push({ part, n, chord, next: BLUES[(n + 1) % 12] }));
}
SWING_FORM.push(
  { part: "end", n: 0, chord: "Bb7", next: "Bb7" },
  { part: "end", n: 1, chord: "Bb7", next: "Bb7" },
);

const canteenSwing: Song = {
  name: "Canteen Swing",
  level: 0.55,
  bars: SWING_FORM.length,
  barLength: () => SWING_Q * 4,
  play(c, i, t, out) {
    const bar = SWING_FORM[i];
    const ch = SWING_CHORDS[bar.chord];
    const at = (pos: number) => t + swung(pos);

    if (bar.part === "end" && bar.n === 1) {
      // Big finish: a held B-flat 6/9 with a trumpet shake and a cymbal.
      const final = [58, 62, 65, 67, 72, 74];
      for (const m of final) brass(c, m, t, SWING_Q * 3.5, 0.045, out, { bright: 1.2 });
      reed(c, 50, t, SWING_Q * 3.5, 0.05, out);
      pluck(c, 34, t, SWING_Q * 3, 0.5, out);
      kick(c, t, 0.5, out);
      cymbal(c, t, 0.2, out, 2.5);
      return;
    }

    // ----- Rhythm section -----
    if (bar.part !== "intro" || bar.n >= 2) {
      const r = ch.root;
      const nextRoot = SWING_CHORDS[bar.next].root;
      const walk =
        bar.n % 2 === 0
          ? [r, r + 4, r + 7, r + 9]
          : [r + 12, r + 10, r + 7, nextRoot + (nextRoot > r ? -1 : 1)];
      walk.forEach((m, b) => pluck(c, m, at(b * 2), SWING_Q * 0.95, 0.42, out));
      // Rhythm guitar: four even chops per bar.
      for (let b = 0; b < 4; b++)
        stab(
          c,
          ch.voicing.slice(0, 3).map((m) => m - 12),
          at(b * 2),
          0.1,
          0.03,
          out,
          1100,
        );
    }
    // Drums: ride "ting, ting-a ting", hi-hat on 2 and 4, feathered bass drum.
    for (const p of [0, 2, 3, 4, 6, 7]) ride(c, at(p), p % 2 ? 0.05 : 0.08, out);
    for (const p of [2, 6]) hat(c, at(p), 0.12, out);
    for (let b = 0; b < 4; b++) kick(c, at(b * 2), bar.part === "shout" ? 0.3 : 0.18, out);
    if (bar.part === "intro" && bar.n < 2) {
      // Drummer kicks it off.
      snare(c, at(1), 0.1, out);
      snare(c, at(3), 0.14, out);
      snare(c, at(5), 0.12, out);
      if (bar.n === 1) roll(c, at(6), SWING_Q, 0.06, 0.25, out);
      return;
    }
    if (bar.part === "intro") {
      // Band hits on beat one.
      for (const m of ch.voicing) brass(c, m, at(0), SWING_Q * 0.5, 0.045, out, { bright: 1.2 });
      return;
    }
    if (bar.part === "end") {
      for (const m of ch.voicing) brass(c, m, at(0), SWING_Q * 0.5, 0.05, out, { bright: 1.2 });
      for (const m of ch.voicing) brass(c, m, at(3), SWING_Q * 0.4, 0.05, out, { bright: 1.2 });
      snare(c, at(3), 0.2, out);
      roll(c, at(5), SWING_Q * 1.4, 0.05, 0.3, out);
      return;
    }
    const riff = (base: number, play: (m: number, s: number, d: number) => void) =>
      RIFF.forEach((step, p) =>
        play(base + ch.offset + step, at(p), (swung(p + 1) - swung(p)) * 0.9),
      );
    if (bar.part === "riff") {
      // Saxes carry the riff; trumpets answer at the end of every other bar.
      riff(58, (m, s, d) => {
        reed(c, m, s, d, 0.065, out);
        reed(c, m - 12, s, d, 0.04, out);
      });
      if (bar.n % 2 === 1) {
        for (const m of ch.voicing)
          brass(c, m + 12, at(6), SWING_Q * 0.3, 0.03, out, { bright: 1.2 });
        for (const m of ch.voicing)
          brass(c, m + 12, at(7), SWING_Q * 0.6, 0.035, out, { bright: 1.2, fall: bar.n === 11 });
      }
      if (bar.n === 0) cymbal(c, t, 0.12, out);
    } else if (bar.part === "tune") {
      // Muted trumpet lead over sustained sax chords.
      line(TRUMPET_TUNE[bar.n], swung, t, (m, s, d) =>
        brass(c, m, s, d * 0.92, 0.1, out, { mute: true, bright: 1.1 }),
      );
      for (const m of ch.pad) reed(c, m, t, SWING_Q * 3.8, 0.035, out);
      if (bar.n === 0) cymbal(c, t, 0.1, out);
    } else {
      // Shout chorus: the whole band, riff in harmony, trumpets screaming on top.
      riff(70, (m, s, d) => {
        brass(c, m, s, d, 0.06, out, { bright: 1.3 });
        brass(c, m + 4, s, d, 0.045, out, { bright: 1.3 });
      });
      riff(58, (m, s, d) => reed(c, m, s, d, 0.05, out));
      if (bar.n % 4 === 0) cymbal(c, t, 0.16, out);
      snare(c, at(2), 0.14, out);
      snare(c, at(6), 0.14, out);
      if (bar.n % 4 === 3) roll(c, at(6), SWING_Q, 0.05, 0.22, out);
    }
  },
};

// ===========================================================================
// 3. Over the Ridge — fife and drum, A minor, 6/8
// ===========================================================================

const RIDGE_EIGHTH = 60 / 64 / 3;
const ridgeAt = (pos: number) => pos * RIDGE_EIGHTH;

const RIDGE_TUNE: Note[][] = [
  [
    [69, 2],
    [71, 1],
    [72, 2],
    [74, 1],
  ],
  [
    [76, 3],
    [74, 3],
  ],
  [
    [72, 2],
    [71, 1],
    [69, 2],
    [67, 1],
  ],
  [[69, 6]],
  [
    [69, 2],
    [71, 1],
    [72, 2],
    [74, 1],
  ],
  [
    [76, 2],
    [77, 1],
    [79, 3],
  ],
  [
    [77, 2],
    [76, 1],
    [74, 2],
    [71, 1],
  ],
  [[76, 6]],
  [
    [81, 3],
    [79, 2],
    [77, 1],
  ],
  [
    [76, 3],
    [72, 3],
  ],
  [
    [74, 2],
    [76, 1],
    [77, 2],
    [74, 1],
  ],
  [[76, 6]],
  [
    [72, 2],
    [74, 1],
    [76, 2],
    [72, 1],
  ],
  [
    [71, 3],
    [67, 3],
  ],
  [
    [69, 2],
    [71, 1],
    [72, 2],
    [71, 1],
  ],
  [[69, 6]],
];
const RIDGE_CHORDS = "Am Am C G Am Am Dm E Am Am Dm Am C G E Am".split(" ");
const RIDGE_ROOTS: Record<string, number[]> = {
  Am: [45, 52],
  C: [48, 55],
  G: [43, 50],
  Dm: [50, 57],
  E: [40, 47],
};

type RidgeBar = { part: "drums" | "fife" | "bugle" | "toll"; n: number };
const RIDGE_FORM: RidgeBar[] = [
  { part: "drums", n: 0 },
  { part: "drums", n: 1 },
  ...RIDGE_TUNE.map((_, n) => ({ part: "fife" as const, n })),
  ...RIDGE_TUNE.map((_, n) => ({ part: "bugle" as const, n })),
  { part: "toll", n: 0 },
  { part: "toll", n: 1 },
];

const overTheRidge: Song = {
  name: "Over the Ridge",
  level: 1,
  bars: RIDGE_FORM.length,
  barLength: () => RIDGE_EIGHTH * 6,
  play(c, i, t, out) {
    const bar = RIDGE_FORM[i];
    const e = RIDGE_EIGHTH;
    if (bar.part === "toll") {
      // The column passes: bass drum tolls and a last, low chord.
      bassDrum(c, t, 0.65, out);
      bassDrum(c, t + e * 3, 0.5, out);
      if (bar.n === 1) {
        horns(c, [57, 60, 64, 69], t, e * 8, 0.04, out);
        tuba(c, 45, t, e * 8, 0.3, out);
        roll(c, t, e * 5, 0.02, 0.18, out);
        cymbal(c, t + e * 5, 0.1, out, 2.5);
      }
      return;
    }
    // Field drums: bass drum on 1 and 4, rudimental snare, rolls between phrases.
    bassDrum(c, t, 0.55, out);
    bassDrum(c, t + e * 3, 0.4, out);
    snare(c, t - 0.025, 0.06, out);
    snare(c, t, 0.16, out);
    snare(c, t + e * 2, 0.08, out);
    snare(c, t + e * 3, 0.15, out);
    snare(c, t + e * 4, 0.07, out);
    snare(c, t + e * 5, 0.09, out);
    if (bar.part === "drums") {
      if (bar.n === 1) roll(c, t + e * 3, e * 3, 0.04, 0.26, out);
      return;
    }
    if (bar.n % 4 === 3) roll(c, t + e * 4, e * 2, 0.04, 0.2, out);
    const chord = RIDGE_CHORDS[bar.n];
    const [root, fifth] = RIDGE_ROOTS[chord];
    // Low horns hold the harmony like a drone.
    horns(c, [root, fifth], t, e * 5.6, bar.part === "bugle" ? 0.045 : 0.03, out);
    tuba(c, root - 12, t, e * 2.5, 0.22, out);
    tuba(c, fifth - 12, t + e * 3, e * 2.5, 0.18, out);
    if (bar.part === "fife") {
      line(RIDGE_TUNE[bar.n], ridgeAt, t, (m, s, d) => fife(c, m + 12, s, d * 0.9, 0.09, out));
    } else {
      // Second time: the bugle takes the tune, fifes an octave above.
      line(RIDGE_TUNE[bar.n], ridgeAt, t, (m, s, d) => {
        brass(c, m, s, d * 0.92, 0.1, out, { bright: 1.15 });
        fife(c, m + 12, s, d * 0.9, 0.05, out);
      });
      if (bar.n % 8 === 0) cymbal(c, t, 0.08, out, 1.6);
    }
  },
};

export const SONGS: Song[] = [campaignMarch, canteenSwing, overTheRidge];
