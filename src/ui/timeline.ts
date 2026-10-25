import type { Peaks } from '../audio/peaks';
import type { Project } from '../core/project';
import type { Clip, Id } from '../core/types';
import { formatRuler } from './format';

export interface PeaksSource {
  getPeaks(assetId: Id): Peaks | undefined;
}

const HEADER_W = 140;
const RULER_H = 26;
const TRACK_H = 96;
const TITLE_H = 16;
const EDGE = 6;
const HANDLE = 4;

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

type DragMode = 'move' | 'trimStart' | 'trimEnd' | 'fadeIn' | 'fadeOut' | 'seek';

interface Drag {
  mode: DragMode;
  clipId?: Id;
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
  private selected: Id | null = null;
  private drag: Drag | null = null;
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
    window.addEventListener('mouseup', () => (this.drag = null));
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

  // ---------- coordinates ----------
  private timeToX(t: number): number {
    return HEADER_W + (t - this.scrollX) * this.pps;
  }
  private xToTime(x: number): number {
    return (x - HEADER_W) / this.pps + this.scrollX;
  }
  private trackIndexAt(y: number): number {
    return Math.floor((y - RULER_H) / TRACK_H);
  }
  private pos(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  private clipRect(trackIndex: number, c: Clip) {
    return {
      x: this.timeToX(c.start),
      y: RULER_H + trackIndex * TRACK_H + 4,
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
    const { x, y } = this.pos(e.clientX, e.clientY);

    if (y < RULER_H && x >= HEADER_W) {
      this.drag = { mode: 'seek', startX: x, start: 0, end: 0, fadeIn: 0, fadeOut: 0 };
      this.onSeek(Math.max(0, this.xToTime(x)));
      return;
    }

    if (x < HEADER_W) {
      const ti = this.trackIndexAt(y);
      const track = this.project.getTracks()[ti];
      const bx = HEADER_W - 30;
      const by = RULER_H + ti * TRACK_H + 10;
      if (track && x >= bx && x <= bx + 22 && y >= by && y <= by + 20) {
        this.project.setMuted(track.id, !track.muted);
      }
      return;
    }

    const h = this.hit(x, y);
    this.selected = h?.clip.id ?? null;
    if (h) {
      const c = h.clip;
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

  private onDrag(e: MouseEvent): void {
    const d = this.drag!;
    const { x, y } = this.pos(e.clientX, e.clientY);

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
    } else {
      const delta = e.shiftKey || !e.deltaX ? e.deltaY : e.deltaX;
      this.scrollX = Math.max(0, this.scrollX + delta / this.pps);
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
    this.dirty = true;
  }

  // ---------- drawing ----------
  private draw(playhead: number): void {
    const g = this.g;
    const { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = C.bg;
    g.fillRect(0, 0, w, h);

    const tracks = this.project.getTracks();

    // lanes
    tracks.forEach((_, i) => {
      const y = RULER_H + i * TRACK_H;
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
      g.fillText('Drop audio files here', HEADER_W + (w - HEADER_W) / 2, RULER_H + 60);
      g.textAlign = 'left';
    }

    this.drawHeaders();
    this.drawRuler();

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

  private drawHeaders(): void {
    const g = this.g;
    this.project.getTracks().forEach((t, i) => {
      const y = RULER_H + i * TRACK_H;
      g.fillStyle = C.panel;
      g.fillRect(0, y, HEADER_W, TRACK_H);
      g.fillStyle = C.border;
      g.fillRect(0, y + TRACK_H - 1, HEADER_W, 1);

      g.fillStyle = C.text;
      g.font = '12px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText(t.name.length > 11 ? `${t.name.slice(0, 10)}…` : t.name, 10, y + 24);

      const bx = HEADER_W - 30;
      const by = y + 10;
      g.fillStyle = t.muted ? C.accent : 'transparent';
      g.fillRect(bx, by, 22, 20);
      g.strokeStyle = t.muted ? C.accent : C.border;
      g.strokeRect(bx + 0.5, by + 0.5, 21, 19);
      g.fillStyle = t.muted ? C.white : C.dim;
      g.font = '11px system-ui, sans-serif';
      g.fillText('M', bx + 7, by + 14);
    });
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

  private drawWave(c: Clip, r: { x: number; y: number; w: number; h: number }): void {
    const p = this.peaks.getPeaks(c.assetId);
    if (!p) return;
    const g = this.g;
    const top = r.y + TITLE_H;
    const hh = r.h - TITLE_H;
    const mid = top + hh / 2;
    const secPerBlock = p.blockSize / p.sampleRate;
    const x0 = Math.max(Math.floor(r.x), HEADER_W);
    const x1 = Math.min(Math.ceil(r.x + r.w), this.w);

    g.strokeStyle = C.wave;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = x0; x < x1; x++) {
      const t0 = c.offset + (x - r.x) / this.pps;
      const t1 = t0 + 1 / this.pps;
      const b0 = Math.max(0, Math.floor(t0 / secPerBlock));
      const b1 = Math.min(p.data.length - 1, Math.max(b0, Math.floor(t1 / secPerBlock)));
      let m = 0;
      for (let b = b0; b <= b1; b++) if (p.data[b] > m) m = p.data[b];
      const a = m * (hh / 2) * 0.95;
      g.moveTo(x + 0.5, mid - a);
      g.lineTo(x + 0.5, mid + a);
    }
    g.stroke();
  }
}
