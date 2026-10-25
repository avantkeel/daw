import type { Peaks } from '../audio/peaks';
import type { Project } from '../core/project';
import type { Clip, Id } from '../core/types';
import { askReplaceClips } from './dialog';
import { formatRuler } from './format';
import { editText } from './textedit';

export interface PeaksSource {
  getPeaks(assetId: Id): Peaks | undefined;
}

const HEADER_W = 200;
const RULER_H = 26;
const TRACK_H = 72;
const TITLE_H = 16;
const EDGE = 6;
const HANDLE = 4;
const CH_BTN_W = 52;
const GRIP_W = 14;
const VOL_X = 84;
const VOL_W = HEADER_W - VOL_X - 14;

const C = {
  bg: '#1e1e1e',
  lane: '#1e1e1e',
  laneAlt: '#232324',
  panel: '#252526',
  border: '#3c3c3c',
  text: '#cccccc',
  dim: '#858585',
  clip: '#0b3a5e',
  clipSel: '#0e639c',
  clipBorder: '#3794ff',
  wave: '#9cdcfe',
  accent: '#007acc',
  white: '#ffffff',
};

type DragMode = 'move' | 'trimStart' | 'trimEnd' | 'fadeIn' | 'fadeOut' | 'seek' | 'trackMove' | 'volume';

interface Drag {
  mode: DragMode;
  clipId?: Id;
  trackId?: Id;
  /** trackMove: the row the track will be dropped on. */
  targetIndex?: number;
  startX: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
}

/** Single-canvas timeline: ruler, track headers, clips, waveforms, playhead. */
export class Timeline {
  private g: CanvasRenderingContext2D;
  private pps = 100; // pixels per second
  private scrollX = 0; // seconds
  private scrollY = 0; // pixels, 0..maxScrollY()
  private selected: Id | null = null;
  private drag: Drag | null = null;
  private editing = false; // a project batch (one undo step) is open for the current drag
  private dirty = true;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private lastPlayhead = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    private project: Project,
    private peaks: PeaksSource,
    private getPlayhead: () => number,
    private onSeek: (t: number) => void,
  ) {
    this.g = canvas.getContext('2d')!;
    project.changed.subscribe(() => (this.dirty = true));

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement ?? canvas);
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    canvas.addEventListener('mousemove', (e) => !this.drag && this.updateCursor(e));
    window.addEventListener('mousemove', (e) => this.drag && this.onDrag(e));
    window.addEventListener('mouseup', () => this.endDrag());
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
        this.project.removeClip(this.selected);
        this.selected = null;
      }
    });

    this.resize();
    const loop = () => {
      const ph = this.getPlayhead();
      if (ph !== this.lastPlayhead) {
        this.lastPlayhead = ph;
        this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        this.draw(ph);
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  zoomBy(factor: number): void {
    const centerX = HEADER_W + (this.w - HEADER_W) / 2;
    this.zoomAt(centerX, factor);
  }

  /** Which track / timeline time is under a screen position (for drops). */
  locate(clientX: number, clientY: number): { trackId: Id | null; time: number } {
    const { x, y } = this.pos(clientX, clientY);
    const track = this.project.getTracks()[this.trackIndexAt(y)];
    return { trackId: track && y >= RULER_H ? track.id : null, time: Math.max(0, this.xToTime(x)) };
  }

  /** True when the screen position is below the ruler (the track area, with or without tracks). */
  inTrackArea(clientX: number, clientY: number): boolean {
    return this.pos(clientX, clientY).y >= RULER_H;
  }

  /** The clip under a screen position, if any. */
  clipAt(clientX: number, clientY: number): Id | null {
    const { x, y } = this.pos(clientX, clientY);
    return this.hit(x, y)?.clip.id ?? null;
  }

  /** Shows a text box over the track's name in its header. */
  beginRenameTrack(trackId: Id): void {
    const ti = this.project.getTracks().findIndex((t) => t.id === trackId);
    const track = this.project.getTracks()[ti];
    if (!track) return;
    const y = this.trackY(ti);
    const host = this.canvas.parentElement ?? document.body;
    editText(host, { x: GRIP_W + 2, y: y + 7, w: HEADER_W - GRIP_W - 40, h: 22 }, track.name, (name) => this.project.renameTrack(trackId, name));
  }

  /** Shows a text box over the clip's title bar. */
  beginRenameClip(clipId: Id): void {
    const tracks = this.project.getTracks();
    const ti = tracks.findIndex((t) => t.clips.some((c) => c.id === clipId));
    const clip = tracks[ti]?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const r = this.clipRect(ti, clip);
    const host = this.canvas.parentElement ?? document.body;
    const x = Math.max(HEADER_W, r.x);
    const w = Math.max(120, Math.min(r.w, this.w - x));
    editText(host, { x, y: r.y, w, h: TITLE_H + 4 }, clip.name, (name) => this.project.renameClip(clipId, name));
  }

  // ---------- coordinates ----------
  private timeToX(t: number): number {
    return HEADER_W + (t - this.scrollX) * this.pps;
  }
  private xToTime(x: number): number {
    return (x - HEADER_W) / this.pps + this.scrollX;
  }
  private trackIndexAt(y: number): number {
    return Math.floor((y - RULER_H + this.scrollY) / TRACK_H);
  }
  /** Top edge (canvas y) of a track row, after vertical scrolling. */
  private trackY(trackIndex: number): number {
    return RULER_H + trackIndex * TRACK_H - this.scrollY;
  }
  private maxScrollY(): number {
    const content = this.project.getTracks().length * TRACK_H;
    return Math.max(0, content - (this.h - RULER_H));
  }
  private clampScrollY(): void {
    this.scrollY = Math.min(this.maxScrollY(), Math.max(0, this.scrollY));
  }
  private pos(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  private clipRect(trackIndex: number, c: Clip) {
    return {
      x: this.timeToX(c.start),
      y: this.trackY(trackIndex) + 4,
      w: c.duration * this.pps,
      h: TRACK_H - 8,
    };
  }

  // ---------- interaction ----------
  private hit(x: number, y: number): { clip: Clip; mode: DragMode } | null {
    if (x < HEADER_W || y < RULER_H) return null;
    const ti = this.trackIndexAt(y);
    const track = this.project.getTracks()[ti];
    if (!track) return null;
    for (const clip of [...track.clips].reverse()) {
      const r = this.clipRect(ti, clip);
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      const near = (hx: number, hy: number) => Math.abs(x - hx) <= HANDLE + 3 && Math.abs(y - hy) <= HANDLE + 3;
      const top = r.y + TITLE_H;
      if (near(r.x + clip.fadeIn * this.pps, top)) return { clip, mode: 'fadeIn' };
      if (near(r.x + r.w - clip.fadeOut * this.pps, top)) return { clip, mode: 'fadeOut' };
      if (x - r.x < EDGE) return { clip, mode: 'trimStart' };
      if (r.x + r.w - x < EDGE) return { clip, mode: 'trimEnd' };
      return { clip, mode: 'move' };
    }
    return null;
  }

  private updateCursor(e: MouseEvent): void {
    const { x, y } = this.pos(e.clientX, e.clientY);
    if (x < HEADER_W && y >= RULER_H) {
      const ti = this.trackIndexAt(y);
      this.canvas.style.cursor = !this.project.getTracks()[ti]
        ? 'default'
        : this.inVolume(x, y, ti) || this.inChannelButton(x, y, ti) ? 'pointer' : 'grab';
      return;
    }
    const h = this.hit(x, y);
    this.canvas.style.cursor = !h
      ? 'default'
      : h.mode === 'trimStart' || h.mode === 'trimEnd'
        ? 'ew-resize'
        : h.mode === 'fadeIn' || h.mode === 'fadeOut'
          ? 'pointer'
          : 'grab';
  }

  private onDown(e: MouseEvent): void {
    if (e.button !== 0) return; // right-click is handled by the context menu
    const { x, y } = this.pos(e.clientX, e.clientY);

    if (y < RULER_H && x >= HEADER_W) {
      this.drag = { mode: 'seek', startX: x, start: 0, end: 0, fadeIn: 0, fadeOut: 0 };
      this.onSeek(Math.max(0, this.xToTime(x)));
      return;
    }

    if (x < HEADER_W) {
      if (y < RULER_H) return;
      const ti = this.trackIndexAt(y);
      const track = this.project.getTracks()[ti];
      const bx = HEADER_W - 30;
      const by = this.trackY(ti) + 10;
      if (track && x >= bx && x <= bx + 22 && y >= by && y <= by + 20) {
        this.project.setMuted(track.id, !track.muted);
      } else if (track && this.inChannelButton(x, y, ti)) {
        this.project.setChannels(track.id, track.channels === 1 ? 2 : 1);
      } else if (track && this.inVolume(x, y, ti)) {
        // The whole drag is one undo step (finishEdit closes the batch).
        this.project.beginBatch();
        this.editing = true;
        this.drag = { mode: 'volume', trackId: track.id, startX: x, start: 0, end: 0, fadeIn: 0, fadeOut: 0 };
        this.setVolumeFromX(track.id, x);
      } else if (track) {
        // Anywhere else on the header: drag to reorder.
        this.drag = { mode: 'trackMove', trackId: track.id, targetIndex: ti, startX: x, start: 0, end: 0, fadeIn: 0, fadeOut: 0 };
        this.dirty = true;
      }
      return;
    }

    const h = this.hit(x, y);
    this.selected = h?.clip.id ?? null;
    if (h) {
      const c = h.clip;
      this.project.beginBatch();
      this.editing = true;
      this.drag = {
        mode: h.mode,
        clipId: c.id,
        startX: x,
        start: c.start,
        end: c.start + c.duration,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
      };
    }
    this.dirty = true;
  }

  private endDrag(): void {
    const d = this.drag;
    this.drag = null;
    if (d?.mode === 'trackMove' && d.trackId !== undefined && d.targetIndex !== undefined) {
      this.project.moveTrack(d.trackId, d.targetIndex);
      this.canvas.style.cursor = 'default';
      this.dirty = true;
      return;
    }
    if (!this.editing) return;
    this.editing = false; // from here finishEdit owns the open batch
    void this.finishEdit(d);
  }

  /**
   * Ends the undo batch opened by the drag. Clips on one track may not overlap, so if a move or trim
   * ended on top of other clips, ask: Delete removes them (same undo step), Cancel puts everything back.
   */
  private async finishEdit(d: Drag | null): Promise<void> {
    try {
      const shapesClip = d?.mode === 'move' || d?.mode === 'trimStart' || d?.mode === 'trimEnd';
      const hits = d?.clipId && shapesClip ? this.project.overlapping(d.clipId) : [];
      const clip = d?.clipId ? this.project.findClip(d.clipId)?.clip : undefined;
      if (clip && hits.length > 0) {
        const deleteThem = await askReplaceClips(clip.name, hits.map((h) => h.name), 'puts the clip back where it was.');
        if (!deleteThem) {
          this.project.abortBatch();
          return;
        }
        for (const h of hits) this.project.removeClip(h.id);
      }
      this.project.endBatch();
    } catch (err) {
      this.project.abortBatch();
      throw err;
    }
  }

  /** The Mono/Stereo toggle in the bottom-left of a track header. */
  private inChannelButton(x: number, y: number, ti: number): boolean {
    const by = this.trackY(ti) + TRACK_H - 28;
    return x >= 10 && x <= 10 + CH_BTN_W && y >= by && y <= by + 18;
  }

  private inVolume(x: number, y: number, ti: number): boolean {
    const cy = this.trackY(ti) + TRACK_H - 17;
    return x >= VOL_X - 4 && x <= VOL_X + VOL_W + 4 && y >= cy - 9 && y <= cy + 9;
  }

  private setVolumeFromX(trackId: Id, x: number): void {
    const v = ((x - VOL_X) / VOL_W) * 2; // slider middle = unity gain
    this.project.setVolume(trackId, Math.round(Math.min(2, Math.max(0, v)) * 100) / 100);
  }

  private onDoubleClick(e: MouseEvent): void {
    if (e.button !== 0) return;
    const { x, y } = this.pos(e.clientX, e.clientY);
    if (y < RULER_H) return;
    if (x < HEADER_W) {
      const ti = this.trackIndexAt(y);
      const track = this.project.getTracks()[ti];
      // Double-click on the name area of a header renames the track.
      const ty = this.trackY(ti);
      if (track && x < HEADER_W - 36 && y >= ty + 4 && y <= ty + 32) this.beginRenameTrack(track.id);
      return;
    }
    const h = this.hit(x, y);
    if (h) this.beginRenameClip(h.clip.id);
  }

  private onDrag(e: MouseEvent): void {
    const d = this.drag!;
    const { x, y } = this.pos(e.clientX, e.clientY);

    if (d.mode === 'trackMove') {
      const last = this.project.getTracks().length - 1;
      d.targetIndex = Math.min(last, Math.max(0, this.trackIndexAt(y)));
      this.canvas.style.cursor = 'grabbing';
      this.dirty = true;
      return;
    }
    if (d.mode === 'volume') {
      if (d.trackId) this.setVolumeFromX(d.trackId, x);
      return;
    }

    if (d.mode === 'seek') {
      this.onSeek(Math.max(0, this.xToTime(x)));
      return;
    }
    if (!d.clipId) return;
    const dt = (x - d.startX) / this.pps;

    switch (d.mode) {
      case 'move': {
        const tracks = this.project.getTracks();
        const ti = Math.min(tracks.length - 1, Math.max(0, this.trackIndexAt(y)));
        const assetId = this.project.findClip(d.clipId)?.clip.assetId;
        this.canvas.style.cursor = assetId && this.project.accepts(tracks[ti].id, assetId) ? 'grabbing' : 'not-allowed';
        this.project.moveClip(d.clipId, d.start + dt, tracks[ti].id);
        break;
      }
      case 'trimStart':
        this.project.trimStart(d.clipId, d.start + dt);
        break;
      case 'trimEnd':
        this.project.trimEnd(d.clipId, d.end + dt);
        break;
      case 'fadeIn':
        this.project.setFadeIn(d.clipId, d.fadeIn + dt);
        break;
      case 'fadeOut':
        this.project.setFadeOut(d.clipId, d.fadeOut - dt);
        break;
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const { x } = this.pos(e.clientX, e.clientY);
      this.zoomAt(x, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Shift+wheel (or a sideways trackpad swipe) scrolls along the timeline.
      const delta = e.deltaX || e.deltaY;
      this.scrollX = Math.max(0, this.scrollX + delta / this.pps);
    } else {
      this.scrollY += e.deltaY;
      this.clampScrollY();
    }
    this.dirty = true;
  }

  private zoomAt(screenX: number, factor: number): void {
    const t = this.xToTime(screenX);
    this.pps = Math.min(2000, Math.max(10, this.pps * factor));
    this.scrollX = Math.max(0, t - (screenX - HEADER_W) / this.pps);
    this.dirty = true;
  }

  private resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    this.dpr = window.devicePixelRatio || 1;
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.clampScrollY();
    this.dirty = true;
  }

  // ---------- drawing ----------
  private draw(playhead: number): void {
    const g = this.g;
    const { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = C.bg;
    g.fillRect(0, 0, w, h);

    this.clampScrollY(); // tracks may have been removed (undo) since the last draw
    const tracks = this.project.getTracks();

    // lanes
    tracks.forEach((_, i) => {
      const y = this.trackY(i);
      g.fillStyle = i % 2 ? C.laneAlt : C.lane;
      g.fillRect(HEADER_W, y, w - HEADER_W, TRACK_H);
      g.fillStyle = C.border;
      g.fillRect(HEADER_W, y + TRACK_H - 1, w - HEADER_W, 1);
    });

    // clips + playhead (clipped to lane area)
    g.save();
    g.beginPath();
    g.rect(HEADER_W, RULER_H, w - HEADER_W, h - RULER_H);
    g.clip();
    tracks.forEach((t, i) => t.clips.forEach((c) => this.drawClip(i, c)));
    g.restore();

    if (tracks.length === 0) {
      g.fillStyle = C.dim;
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Drop audio files here, or right-click to add a track', HEADER_W + (w - HEADER_W) / 2, RULER_H + 60);
      g.textAlign = 'left';
    }

    this.drawHeaders();
    this.drawTrackDrop();
    this.drawRuler();
    this.drawScrollbar();

    // playhead
    const px = this.timeToX(playhead);
    if (px >= HEADER_W && px <= w) {
      g.fillStyle = C.white;
      g.fillRect(Math.round(px), 0, 1, h);
      g.beginPath();
      g.moveTo(px - 5, 0);
      g.lineTo(px + 6, 0);
      g.lineTo(px + 0.5, 8);
      g.closePath();
      g.fill();
    }
  }

  /** Thin vertical scroll indicator, only when the tracks don't all fit. */
  private drawScrollbar(): void {
    const max = this.maxScrollY();
    if (max <= 0) return;
    const view = this.h - RULER_H;
    const thumbH = Math.max(20, (view * view) / (view + max));
    const thumbY = RULER_H + (this.scrollY / max) * (view - thumbH);
    this.g.fillStyle = '#424242';
    this.g.fillRect(this.w - 6, thumbY, 4, thumbH);
  }

  private drawRuler(): void {
    const g = this.g;
    g.fillStyle = C.panel;
    g.fillRect(0, 0, this.w, RULER_H);
    g.fillStyle = C.border;
    g.fillRect(0, RULER_H - 1, this.w, 1);

    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120];
    const step = steps.find((s) => s * this.pps >= 70) ?? 300;
    g.font = '10px system-ui, sans-serif';
    g.fillStyle = C.dim;
    for (let t = Math.floor(this.scrollX / step) * step; ; t += step) {
      const x = this.timeToX(t);
      if (x > this.w) break;
      if (x < HEADER_W) continue;
      g.fillRect(Math.round(x), RULER_H - 8, 1, 8);
      g.fillText(formatRuler(t), x + 4, RULER_H - 10);
    }
    // header corner
    g.fillStyle = C.panel;
    g.fillRect(0, 0, HEADER_W, RULER_H);
    g.fillStyle = C.border;
    g.fillRect(HEADER_W - 1, 0, 1, this.h);
  }

  /** Cuts text so it fits `maxW` pixels, adding an ellipsis. */
  private fit(text: string, maxW: number): string {
    const g = this.g;
    if (g.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
  }

  private drawHeaders(): void {
    const g = this.g;
    this.project.getTracks().forEach((t, i) => {
      const y = this.trackY(i);
      const moving = this.drag?.mode === 'trackMove' && this.drag.trackId === t.id;
      g.fillStyle = moving ? '#2d2d30' : C.panel;
      g.fillRect(0, y, HEADER_W, TRACK_H);
      g.fillStyle = C.border;
      g.fillRect(0, y + TRACK_H - 1, HEADER_W, 1);

      // grip (drag to reorder)
      g.fillStyle = C.dim;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) g.fillRect(3 + c * 4, y + TRACK_H / 2 - 7 + r * 5, 2, 2);

      // name
      g.fillStyle = moving ? C.dim : C.text;
      g.font = '12px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText(this.fit(t.name, HEADER_W - GRIP_W - 44), GRIP_W + 6, y + 23);

      // mute
      const bx = HEADER_W - 30;
      const by = y + 10;
      g.fillStyle = t.muted ? C.accent : 'transparent';
      g.fillRect(bx, by, 22, 20);
      g.strokeStyle = t.muted ? C.accent : C.border;
      g.strokeRect(bx + 0.5, by + 0.5, 21, 19);
      g.fillStyle = t.muted ? C.white : C.dim;
      g.font = '11px system-ui, sans-serif';
      g.fillText('M', bx + 7, by + 14);

      // Mono / Stereo toggle
      const cy = y + TRACK_H - 28;
      if (t.clips.length === 0) {
        // Only an empty track can change layout; a track with audio just shows its label.
        g.strokeStyle = C.border;
        g.strokeRect(GRIP_W + 0.5, cy + 0.5, CH_BTN_W - 1, 17);
      }
      g.fillStyle = C.dim;
      g.fillText(t.channels === 1 ? 'Mono' : 'Stereo', GRIP_W + 7, cy + 13);

      // volume slider (middle = unity)
      const vy = y + TRACK_H - 19;
      g.fillStyle = C.border;
      g.fillRect(VOL_X, vy, VOL_W, 4);
      g.fillStyle = C.accent;
      g.fillRect(VOL_X, vy, (t.volume / 2) * VOL_W, 4);
      g.fillStyle = C.dim;
      g.fillRect(VOL_X + VOL_W / 2, vy - 2, 1, 8);
      g.fillStyle = C.white;
      g.fillRect(VOL_X + (t.volume / 2) * VOL_W - 2, vy - 3, 4, 10);
    });
  }

  /** While a track header is dragged: highlight where it will land. */
  private drawTrackDrop(): void {
    const d = this.drag;
    if (!d || d.mode !== 'trackMove' || d.targetIndex === undefined || d.trackId === undefined) return;
    const from = this.project.getTracks().findIndex((t) => t.id === d.trackId);
    if (from < 0 || from === d.targetIndex) return;
    const y = this.trackY(d.targetIndex) + (d.targetIndex > from ? TRACK_H : 0);
    this.g.fillStyle = C.accent;
    this.g.fillRect(0, y - 1, this.w, 2);
  }

  private drawClip(ti: number, c: Clip): void {
    const g = this.g;
    const r = this.clipRect(ti, c);
    if (r.x + r.w < HEADER_W || r.x > this.w) return;
    const sel = c.id === this.selected;
    const top = r.y + TITLE_H;

    g.fillStyle = sel ? C.clipSel : C.clip;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(r.x, r.y, r.w, TITLE_H);

    this.drawWave(c, r);

    // fades: shaded cut-away + gain line
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.strokeStyle = C.white;
    g.lineWidth = 1;
    if (c.fadeIn > 0) {
      const fx = c.fadeIn * this.pps;
      g.beginPath();
      g.moveTo(r.x, top);
      g.lineTo(r.x + fx, top);
      g.lineTo(r.x, r.y + r.h);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(r.x, r.y + r.h);
      g.lineTo(r.x + fx, top);
      g.stroke();
    }
    if (c.fadeOut > 0) {
      const fx = c.fadeOut * this.pps;
      g.beginPath();
      g.moveTo(r.x + r.w, top);
      g.lineTo(r.x + r.w - fx, top);
      g.lineTo(r.x + r.w, r.y + r.h);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(r.x + r.w - fx, top);
      g.lineTo(r.x + r.w, r.y + r.h);
      g.stroke();
    }

    // fade handles
    g.fillStyle = C.white;
    g.fillRect(r.x + c.fadeIn * this.pps - HANDLE, top - HANDLE, HANDLE * 2, HANDLE * 2);
    g.fillRect(r.x + r.w - c.fadeOut * this.pps - HANDLE, top - HANDLE, HANDLE * 2, HANDLE * 2);

    // title
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, TITLE_H);
    g.clip();
    g.fillStyle = C.white;
    g.font = '11px system-ui, sans-serif';
    g.fillText(c.name, r.x + 6, r.y + 12);
    g.restore();

    g.strokeStyle = sel ? C.white : C.clipBorder;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  /** Waveform: one lane for mono audio, two stacked lanes (left on top, right below) for stereo. */
  private drawWave(c: Clip, r: { x: number; y: number; w: number; h: number }): void {
    const p = this.peaks.getPeaks(c.assetId);
    if (!p) return;
    const g = this.g;
    const top = r.y + TITLE_H;
    const laneH = (r.h - TITLE_H) / p.channels.length;
    const secPerBlock = p.blockSize / p.sampleRate;
    const x0 = Math.max(Math.floor(r.x), HEADER_W);
    const x1 = Math.min(Math.ceil(r.x + r.w), this.w);

    g.strokeStyle = C.wave;
    g.lineWidth = 1;
    g.beginPath();
    p.channels.forEach((data, lane) => {
      const mid = top + laneH * lane + laneH / 2;
      for (let x = x0; x < x1; x++) {
        const t0 = c.offset + (x - r.x) / this.pps;
        const t1 = t0 + 1 / this.pps;
        const b0 = Math.max(0, Math.floor(t0 / secPerBlock));
        const b1 = Math.min(data.length - 1, Math.max(b0, Math.floor(t1 / secPerBlock)));
        let m = 0;
        for (let b = b0; b <= b1; b++) if (data[b] > m) m = data[b];
        const a = m * (laneH / 2) * 0.95;
        g.moveTo(x + 0.5, mid - a);
        g.lineTo(x + 0.5, mid + a);
      }
    });
    g.stroke();

    if (p.channels.length > 1) {
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.fillRect(x0, Math.round(top + laneH), x1 - x0, 1);
    }
  }
}
