import { Emitter } from './emitter';
import type { AssetRef, ChannelCount, Clip, Id, Track, TrackData } from './types';

const MIN_CLIP = 0.01;
const MAX_HISTORY = 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

let seq = 0;
const uid = (prefix: string): Id => `${prefix}_${++seq}`;

export interface NewClip {
  assetId: Id;
  name: string;
  sourceDuration: number;
  start: number;
}

/**
 * The whole editable document. Knows nothing about audio APIs, DOM or Electron.
 *
 * Undo/redo: history holds snapshots of the tracks (assets are not part of it). Every edit is one
 * undo step. A drag makes many edits, so the UI wraps it in beginBatch()/endBatch() (or batch())
 * and the whole gesture becomes a single step.
 */
export class Project {
  readonly changed = new Emitter();
  private tracks: Track[] = [];
  private assets = new Map<Id, AssetRef>();

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private batching = 0;
  private batchBefore = '';

  getTracks(): readonly Track[] {
    return this.tracks;
  }

  /** Replaces the whole project (used when opening a file). Ids are generated here. Clears undo history. */
  load(tracks: TrackData[], assets: AssetRef[]): void {
    this.assets = new Map(assets.map((a) => [a.id, a]));
    this.tracks = tracks.map((t) => ({
      id: uid('track'),
      name: t.name,
      channels: t.channels,
      volume: t.volume,
      muted: t.muted,
      clips: t.clips.map((c) => ({ ...c, id: uid('clip') })),
    }));
    this.undoStack = [];
    this.redoStack = [];
    this.batching = 0;
    this.changed.emit();
  }

  // ---------- undo / redo ----------

  /** Starts grouping edits into one undo step. Must be paired with endBatch(). Nesting is fine. */
  beginBatch(): void {
    if (this.batching++ === 0) this.batchBefore = this.snapshot();
  }

  endBatch(): void {
    if (this.batching === 0) return;
    if (--this.batching === 0) this.record(this.batchBefore);
  }

  batch(fn: () => void): void {
    this.beginBatch();
    try {
      fn();
    } finally {
      this.endBatch();
    }
  }

  /** Returns false if there was nothing to undo. */
  undo(): boolean {
    const prev = this.batching === 0 ? this.undoStack.pop() : undefined;
    if (prev === undefined) return false;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    return true;
  }

  /** Returns false if there was nothing to redo. */
  redo(): boolean {
    const next = this.batching === 0 ? this.redoStack.pop() : undefined;
    if (next === undefined) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    return true;
  }

  private snapshot(): string {
    return JSON.stringify(this.tracks);
  }

  private restore(snapshot: string): void {
    this.tracks = JSON.parse(snapshot) as Track[];
    this.changed.emit();
  }

  private record(before: string): void {
    if (before === this.snapshot()) return; // nothing actually changed
    this.undoStack.push(before);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Runs one edit: records it for undo (unless a batch is open) and notifies listeners. */
  private change<T>(edit: () => T): T {
    if (this.batching > 0) {
      const result = edit();
      this.changed.emit();
      return result;
    }
    const before = this.snapshot();
    const result = edit();
    this.record(before);
    this.changed.emit();
    return result;
  }

  // ---------- assets ----------

  registerAsset(ref: AssetRef): void {
    this.assets.set(ref.id, ref);
  }

  getAssets(): AssetRef[] {
    return [...this.assets.values()];
  }

  /** Points an asset at a different file (e.g. after copying it into the project folder). Not undoable. */
  setAssetPath(id: Id, path: string): void {
    const a = this.assets.get(id);
    if (!a) return;
    a.path = path;
    this.changed.emit();
  }

  getAsset(id: Id): AssetRef | undefined {
    return this.assets.get(id);
  }

  duration(): number {
    let d = 0;
    for (const t of this.tracks) for (const c of t.clips) d = Math.max(d, c.start + c.duration);
    return d;
  }

  findClip(id: Id): { track: Track; clip: Clip } | undefined {
    for (const track of this.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return { track, clip };
    }
    return undefined;
  }

  // ---------- edits ----------

  addTrack(name = `Track ${this.tracks.length + 1}`, channels: ChannelCount = 2): Track {
    return this.change(() => {
      const track: Track = { id: uid('track'), name, channels, volume: 1, muted: false, clips: [] };
      this.tracks.push(track);
      return track;
    });
  }

  setChannels(trackId: Id, channels: ChannelCount): void {
    const t = this.tracks.find((x) => x.id === trackId);
    if (!t || t.channels === channels) return;
    this.change(() => (t.channels = channels));
  }

  setMuted(trackId: Id, muted: boolean): void {
    const t = this.tracks.find((x) => x.id === trackId);
    if (!t) return;
    this.change(() => (t.muted = muted));
  }

  addClip(trackId: Id, init: NewClip): Clip | undefined {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return undefined;
    return this.change(() => {
      const clip: Clip = {
        id: uid('clip'),
        assetId: init.assetId,
        name: init.name,
        start: Math.max(0, init.start),
        offset: 0,
        duration: init.sourceDuration,
        sourceDuration: init.sourceDuration,
        fadeIn: 0,
        fadeOut: 0,
      };
      track.clips.push(clip);
      return clip;
    });
  }

  removeClip(id: Id): void {
    const found = this.findClip(id);
    if (!found) return;
    this.change(() => {
      found.track.clips = found.track.clips.filter((c) => c.id !== id);
    });
  }

  moveClip(id: Id, start: number, trackId?: Id): void {
    const found = this.findClip(id);
    if (!found) return;
    this.change(() => {
      found.clip.start = Math.max(0, start);
      if (trackId && trackId !== found.track.id) {
        const dest = this.tracks.find((t) => t.id === trackId);
        if (dest) {
          found.track.clips = found.track.clips.filter((c) => c.id !== id);
          dest.clips.push(found.clip);
        }
      }
    });
  }

  /** Move the clip's left edge to `newStart` (timeline seconds). Content stays in place. */
  trimStart(id: Id, newStart: number): void {
    const found = this.findClip(id);
    if (!found) return;
    this.change(() => {
      const c = found.clip;
      const minD = Math.max(-c.offset, -c.start);
      const maxD = c.duration - MIN_CLIP;
      const d = clamp(newStart - c.start, minD, maxD);
      c.start += d;
      c.offset += d;
      c.duration -= d;
      this.fitFades(c);
    });
  }

  /** Move the clip's right edge to `newEnd` (timeline seconds). */
  trimEnd(id: Id, newEnd: number): void {
    const found = this.findClip(id);
    if (!found) return;
    this.change(() => {
      const c = found.clip;
      c.duration = clamp(newEnd - c.start, MIN_CLIP, c.sourceDuration - c.offset);
      this.fitFades(c);
    });
  }

  setFadeIn(id: Id, seconds: number): void {
    const found = this.findClip(id);
    if (!found) return;
    this.change(() => {
      const c = found.clip;
      c.fadeIn = clamp(seconds, 0, c.duration - c.fadeOut);
    });
  }

  setFadeOut(id: Id, seconds: number): void {
    const found = this.findClip(id);
    if (!found) return;
    this.change(() => {
      const c = found.clip;
      c.fadeOut = clamp(seconds, 0, c.duration - c.fadeIn);
    });
  }

  private fitFades(c: Clip): void {
    c.fadeIn = Math.min(c.fadeIn, c.duration);
    c.fadeOut = Math.min(c.fadeOut, c.duration - c.fadeIn);
  }
}
