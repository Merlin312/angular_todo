import { Injectable } from '@angular/core';

/**
 * SoundService — synthesizes UI sounds via Web Audio API.
 * No external audio files required.
 * All methods are wrapped in try/catch for graceful degradation
 * in environments without AudioContext (jsdom tests, old browsers).
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    // Resume if browser suspended the context (autoplay policy)
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    startTime: number
  ): void {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gainNode.gain.setValueAtTime(gain, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  /** Ascending ding A5 → C6 — task added */
  playAdd(): void {
    try {
      const t = this.getCtx().currentTime;
      this.tone(880, 0.1, 'sine', 0.2, t);
      this.tone(1046, 0.15, 'sine', 0.25, t + 0.08);
    } catch {}
  }

  /** C5 → E5 → G5 arpeggio — task completed */
  playComplete(): void {
    try {
      const t = this.getCtx().currentTime;
      this.tone(523, 0.1, 'sine', 0.2, t);
      this.tone(659, 0.1, 'sine', 0.2, t + 0.07);
      this.tone(784, 0.18, 'sine', 0.25, t + 0.14);
    } catch {}
  }

  /** Descending G5 → G4 — task marked incomplete */
  playUncomplete(): void {
    try {
      const t = this.getCtx().currentTime;
      this.tone(523, 0.1, 'sine', 0.15, t);
      this.tone(392, 0.12, 'sine', 0.12, t + 0.06);
    } catch {}
  }

  /** Soft thud — task deleted */
  playDelete(): void {
    try {
      const t = this.getCtx().currentTime;
      this.tone(300, 0.06, 'sine', 0.25, t);
      this.tone(180, 0.1, 'sine', 0.12, t + 0.04);
    } catch {}
  }

  /** Soft click — edit saved */
  playEdit(): void {
    try {
      const t = this.getCtx().currentTime;
      this.tone(700, 0.05, 'triangle', 0.15, t);
      this.tone(900, 0.08, 'triangle', 0.12, t + 0.05);
    } catch {}
  }
}
