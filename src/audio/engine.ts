import type { Project } from '../core/project';
import { AssetStore } from './assets';
import { scheduleProject, type ScheduledPlayback } from './scheduler';

export class AudioEngine {
  readonly ctx = new AudioContext();
  readonly assets = new AssetStore(this.ctx);

  private scheduled: ScheduledPlayback | null = null;
  private startedAt = 0; // ctx time that maps to startPos
  private startPos = 0; // timeline position at startedAt (or paused position)
  private _playing = false;
  private restartTimer: number | undefined;

  constructor(private project: Project) {
    // Edits while playing: re-schedule from the current position (debounced).
    project.changed.subscribe(() => {
      if (!this._playing) return;
      window.clearTimeout(this.restartTimer);
      this.restartTimer = window.setTimeout(() => {
        if (this._playing) void this.play(this.position);
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
    if (!this._playing) return this.startPos;
    return this.startPos + Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  async play(from: number = this.position): Promise<void> {
    await this.ctx.resume();
    this.scheduled?.stop();
    const when = this.ctx.currentTime + 0.05;
    this.scheduled = scheduleProject(this.ctx, this.ctx.destination, this.project.getTracks(), this.assets, from, when);
    this.startPos = from;
    this.startedAt = when;
    this._playing = true;
  }

  pause(): void {
    const p = this.position;
    this.scheduled?.stop();
    this.scheduled = null;
    this._playing = false;
    this.startPos = p;
  }

  stop(): void {
    this.scheduled?.stop();
    this.scheduled = null;
    this._playing = false;
    this.startPos = 0;
  }

  seek(t: number): void {
    const p = Math.max(0, t);
    if (this._playing) void this.play(p);
    else this.startPos = p;
  }
}
