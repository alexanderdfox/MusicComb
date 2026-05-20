/**
 * Map MIDI note data → radial music-comb prong lengths (mm).
 */

export const DEFAULT_DIMS = {
  hubRadius: 7,
  minProngLen: 14,
  maxProngLen: 38,
  minMidi: 48,
  maxMidi: 84,
};

/**
 * @param {import('@tonejs/midi').Midi} midi
 * @param {object} opts
 */
export function extractNotes(midi, opts = {}) {
  const { trackIndex = 0, useAllTracks = false } = opts;
  const tracks = useAllTracks
    ? midi.tracks.filter((t) => t.notes.length > 0)
    : [midi.tracks[trackIndex]].filter(Boolean);

  const notes = [];
  for (const track of tracks) {
    for (const n of track.notes) {
      notes.push({
        time: n.time,
        duration: n.duration,
        midi: n.midi,
        name: n.name,
        velocity: n.velocity,
      });
    }
  }
  notes.sort((a, b) => a.time - b.time);
  return notes;
}

/** Fill null slots by carrying nearest pitch. */
export function fillRests(pitches) {
  const out = [...pitches];
  let last = out.find((p) => p != null) ?? 60;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null) out[i] = last;
    else last = out[i];
  }
  last = out.find((p) => p != null) ?? 60;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] == null) out[i] = last;
    else last = out[i];
  }
  return out;
}

export function pitchesToLengths(pitches, dims = DEFAULT_DIMS) {
  const { minProngLen, maxProngLen, minMidi, maxMidi } = dims;
  const lo = minMidi;
  const hi = maxMidi;
  const span = hi - lo || 1;
  return pitches.map((p) => {
    const clamped = Math.max(lo, Math.min(hi, p));
    const t = (clamped - lo) / span;
    return minProngLen + t * (maxProngLen - minProngLen);
  });
}

/**
 * Quantize notes into N time slots around one revolution.
 * @returns {{ lengths: number[], pitches: number[], slots: object[] }}
 */
export function midiToComb(midi, opts = {}) {
  const numProngs = opts.numProngs ?? 54;
  const mapping = opts.mapping ?? "highest";
  const notes = extractNotes(midi, opts);

  if (notes.length === 0) {
    const lengths = Array(numProngs).fill(DEFAULT_DIMS.minProngLen);
    return {
      lengths,
      pitches: Array(numProngs).fill(60),
      slots: [],
      duration: midi.duration,
    };
  }

  const end = Math.max(
    midi.duration,
    ...notes.map((n) => n.time + n.duration)
  );
  const slotDur = end / numProngs;
  const pitches = [];
  const slots = [];

  for (let i = 0; i < numProngs; i++) {
    const t0 = i * slotDur;
    const t1 = (i + 1) * slotDur;
    const inSlot = notes.filter(
      (n) => n.time < t1 && n.time + n.duration > t0
    );
    let pitch = null;
    if (inSlot.length > 0) {
      if (mapping === "average") {
        pitch =
          inSlot.reduce((s, n) => s + n.midi, 0) / inSlot.length;
        pitch = Math.round(pitch);
      } else if (mapping === "last") {
        pitch = inSlot.sort((a, b) => a.time - b.time).at(-1).midi;
      } else {
        pitch = Math.max(...inSlot.map((n) => n.midi));
      }
    }
    pitches.push(pitch);
    slots.push({ index: i, t0, t1, notes: inSlot, pitch });
  }

  const filled = fillRests(pitches);
  const lengths = pitchesToLengths(filled, opts.dims ?? DEFAULT_DIMS);

  return {
    lengths,
    pitches: filled,
    slots,
    duration: end,
    numProngs,
  };
}

export function hurrianDefault(numProngs = 54) {
  const degrees = [
    0, 2, 0, -1, 0, 2, 4, 2, 0, -1, 0, 2, 3, 2, 0, -1, 0, 2, 0, -1,
    -2, 0, 2, 4, 5, 4, 2, 0, -1, 0, 2, 0, -1, 0, 2, 4, 2, 0, -1, 0,
    2, 3, 2, 0, -1, -2, 0, 2, 0, -1, 0, 2, 4, 2,
  ];
  let cumulative = 0;
  const pitches = [];
  for (let i = 0; i < numProngs; i++) {
    const d = degrees[i % degrees.length];
    cumulative += d;
    pitches.push(60 + cumulative);
  }
  const duration = Math.max(6, numProngs * 0.19);
  return {
    lengths: pitchesToLengths(pitches),
    pitches,
    slots: [],
    duration,
    numProngs,
    source: "hurrian",
  };
}

export function buildConfig(result, meta = {}) {
  return {
    version: 1,
    songName: meta.songName ?? "Untitled",
    numProngs: result.numProngs ?? result.lengths.length,
    prongLengthsMm: result.lengths,
    pitches: result.pitches,
    playback: {
      spinDirection: "counter-clockwise",
      noteOrder: "prong index 0 → N-1 as rake sweeps clockwise slots",
      alignMarks: "spinner arrow with comb triangle before spinning",
    },
    dims: { ...DEFAULT_DIMS, ...meta.dims },
    midi: meta.midi ?? null,
  };
}
