import { Emitter } from './emitter';
import type { AssetRef, ChannelCount, Clip, Id, Track, TrackData } from './types';

const MIN_CLIP = 0.01;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

let seq = 0;
const uid = (prefix: string): Id => `${prefix}_${++seq}`;

export interface NewClip {
  assetId: Id;
  name: string;
  sourceDuration: number;
  start: number;
}

/** The whole editable document. Knows nothing about audio APIs, DOM or Electron. */
export class Project {
  readonly changed = new Emitter();
  private tracks: Track[] = [];
  private assets = new Map<Id, AssetRef>();

  getTracks(): readonly Track[] {
    return this.tracks;
  }

  /** Replaces the whole project (used when opening a file). Ids are generated here. */
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
    this.changed.emit();
  }

  registerAsset(ref: AssetRef): void {
    this.assets.set(ref.id, ref);
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

  addTrack(name = `Track ${this.tracks.length + 1}`, channels: ChannelCount = 2): Track {
    const track: Track = { id: uid('track'), name, channels, volume: 1, muted: false, clips: [] };
    this.tracks.push(track);
    this.changed.emit();
    return track;
  }

  setChannels(trackId: Id, channels: ChannelCount): void {
    const t = this.tracks.find((x) => x.id === trackId);
    if (!t || t.channels === channels) return;
    t.channels = channels;
    this.changed.emit();
  }

  setMuted(trackId: Id, muted: boolean): void {
    const t = this.tracks.find((x) => x.id === trackId);
    if (!t) return;
    t.muted = muted;
    this.changed.emit();
  }

  addClip(trackId: Id, init: NewClip): Clip | undefined {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return undefined;
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
    this.changed.emit();
    return clip;
  }

  removeClip(id: Id): void {
    const found = this.findClip(id);
    if (!found) return;
    found.track.clips = found.track.clips.filter((c) => c.id !== id);
    this.changed.emit();
  }

  moveClip(id: Id, start: number, trackId?: Id): void {
    const found = this.findClip(id);
    if (!found) return;
    found.clip.start = Math.max(0, start);
    if (trackId && trackId !== found.track.id) {
      const dest = this.tracks.find((t) => t.id === trackId);
      if (dest) {
        found.track.clips = found.track.clips.filter((c) => c.id !== id);
        dest.clips.push(found.clip);
      }
    }
    this.changed.emit();
  }

  /** Move the clip's left edge to `newStart` (timeline seconds). Content stays in place. */
  trimStart(id: Id, newStart: number): void {
    const found = this.findClip(id);
    if (!found) return;
    const c = found.clip;
    const minD = Math.max(-c.offset, -c.start);
    const maxD = c.duration - MIN_CLIP;
    const d = clamp(newStart - c.start, minD, maxD);
    c.start += d;
    c.offset += d;
    c.duration -= d;
    this.fitFades(c);
    this.changed.emit();
  }

  /** Move the clip's right edge to `newEnd` (timeline seconds). */
  trimEnd(id: Id, newEnd: number): void {
    const found = this.findClip(id);
    if (!found) return;
    const c = found.clip;
    c.duration = clamp(newEnd - c.start, MIN_CLIP, c.sourceDuration - c.offset);
    this.fitFades(c);
    this.changed.emit();
  }

  setFadeIn(id: Id, seconds: number): void {
    const found = this.findClip(id);
    if (!found) return;
    const c = found.clip;
    c.fadeIn = clamp(seconds, 0, c.duration - c.fadeOut);
    this.changed.emit();
  }

  setFadeOut(id: Id, seconds: number): void {
    const found = this.findClip(id);
    if (!found) return;
    const c = found.clip;
    c.fadeOut = clamp(seconds, 0, c.duration - c.fadeIn);
    this.changed.emit();
  }

  private fitFades(c: Clip): void {
    c.fadeIn = Math.min(c.fadeIn, c.duration);
    c.fadeOut = Math.min(c.fadeOut, c.duration - c.fadeIn);
  }
}
