/**
 * Kalimba-like plucks via Web Audio — one note per prong strike during CCW spin.
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToLabel(midi) {
  const n = Math.round(midi);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const oct = Math.floor(n / 12) - 1;
  return `${name}${oct}`;
}

export class CombAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {GainNode | null} */
    this.master = null;
    this.muted = false;
  }

  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /**
   * @param {number} midi — MIDI note number
   * @param {number} [velocity] — 0–1
   */
  pluck(midi, velocity = 0.72) {
    if (this.muted || !this.ctx || !this.master) return;

    const midiClamped = Math.max(0, Math.min(127, midi));
    const t = this.ctx.currentTime;
    const freq = midiToFreq(midiClamped);
    const peak = 0.22 * Math.min(1, Math.max(0.15, velocity));
    const decay = 0.1 + (100 - midiClamped) * 0.0012;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);

    const partial = this.ctx.createOscillator();
    partial.type = "triangle";
    partial.frequency.setValueAtTime(freq * 2.005, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    const gainHi = this.ctx.createGain();
    gainHi.gain.setValueAtTime(0.0001, t);
    gainHi.gain.exponentialRampToValueAtTime(peak * 0.28, t + 0.002);
    gainHi.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.65);

    osc.connect(gain);
    partial.connect(gainHi);
    gain.connect(this.master);
    gainHi.connect(this.master);

    const stopAt = t + decay + 0.08;
    osc.start(t);
    partial.start(t);
    osc.stop(stopAt);
    partial.stop(stopAt);
  }
}
