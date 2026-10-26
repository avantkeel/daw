import type { Project } from "../core/project";
import type { Id } from "../core/types";
import { AssetStore } from "./assets";
import { scheduleProject, type ScheduledPlayback } from "./scheduler";

export class AudioEngine {
  readonly ctx = new AudioContext();
  readonly assets = new AssetStore(this.ctx);

  private scheduled: ScheduledPlayback | null = null;
  private startedAt = 0; // ctx time that maps to startPos
  private startPos = 0; // timeline position at startedAt
  private cuePosition = 0; // selected timeline position to return to when playback pauses
  private _playing = false;
  private restartTimer: number | undefined;
  private meters = new Map<Id, AnalyserNode>();

  constructor(private project: Project) {
    // Edits while playing: re-schedule from the current position (debounced).
    project.changed.subscribe(() => {
      if (!this._playing) return;
      window.clearTimeout(this.restartTimer);
      this.restartTimer = window.setTimeout(() => {
        if (this._playing) void this.startPlayback(this.position);
      }, 120);
    });
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get playing(): boolean {
    return this._playing;
  }

  get position(): number {
    if (!this._playing) return this.cuePosition;
    return this.startPos + Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  getTrackLevels(): ReadonlyMap<Id, number> {
    const levels = new Map<Id, number>();
    for (const [trackId, meter] of this.meters) {
      const samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      const decibels = rms > 0 ? 20 * Math.log10(rms) : -60;
      levels.set(trackId, Math.max(0, Math.min(1, (decibels + 60) / 60)));
    }
    return levels;
  }

  async play(from: number = this.position): Promise<void> {
    this.cuePosition = Math.max(0, from);
    await this.startPlayback(this.cuePosition);
  }

  private async startPlayback(from: number): Promise<void> {
    await this.ctx.resume();
    this.scheduled?.stop();
    this.meters.clear();
    const tracks = this.project.getTracks();
    const hasSolo = tracks.some((track) => track.solo);
    for (const track of tracks) {
      if (track.muted || (hasSolo && !track.solo)) continue;
      const meter = this.ctx.createAnalyser();
      meter.fftSize = 256;
      this.meters.set(track.id, meter);
    }
    const when = this.ctx.currentTime + 0.05;
    this.scheduled = scheduleProject(
      this.ctx,
      this.ctx.destination,
      tracks,
      this.assets,
      from,
      when,
      this.meters,
    );
    this.startPos = Math.max(0, from);
    this.startedAt = when;
    this._playing = true;
  }

  pause(): void {
    this.scheduled?.stop();
    this.scheduled = null;
    this.meters.clear();
    this._playing = false;
    this.startPos = this.cuePosition;
  }

  stop(): void {
    this.scheduled?.stop();
    this.scheduled = null;
    this.meters.clear();
    this._playing = false;
    this.cuePosition = 0;
    this.startPos = 0;
  }

  seek(t: number): void {
    const p = Math.max(0, t);
    this.cuePosition = p;
    if (this._playing) void this.startPlayback(p);
    else this.startPos = p;
  }
}
