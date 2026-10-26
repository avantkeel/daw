import { byId } from "./dom";
import { formatTime } from "./format";

export interface ToolbarHandlers {
  onPlayPause(): void;
  onStop(): void;
  onToggleMixer(open: boolean): void;
  onExport(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onTempoChange(tempo: number): void;
  onGridChange(beats: number): void;
}

export class Toolbar {
  private play = byId<HTMLButtonElement>("btn-play");
  private time = byId<HTMLElement>("time");
  private status = byId<HTMLElement>("status");
  private lastTime = "";
  private lastPlaying: boolean | null = null;
  private mixerButton = byId<HTMLButtonElement>("btn-mixer");
  private mixer = byId<HTMLElement>("mixer");
  private stage = byId<HTMLElement>("stage");
  private tempo = byId<HTMLInputElement>("tempo");

  constructor(h: ToolbarHandlers) {
    this.play.addEventListener("click", h.onPlayPause);
    byId("btn-stop").addEventListener("click", h.onStop);
    this.mixerButton.addEventListener("click", () => {
      const open = this.mixer.hidden;
      this.mixer.hidden = !open;
      this.stage.hidden = open;
      this.mixerButton.setAttribute("aria-pressed", String(open));
      h.onToggleMixer(open);
    });
    byId("btn-export").addEventListener("click", h.onExport);
    byId("btn-zoom-in").addEventListener("click", h.onZoomIn);
    byId("btn-zoom-out").addEventListener("click", h.onZoomOut);
    this.tempo.addEventListener("change", () =>
      h.onTempoChange(this.tempo.valueAsNumber),
    );
    byId<HTMLSelectElement>("grid").addEventListener("change", (e) => {
      h.onGridChange(Number((e.currentTarget as HTMLSelectElement).value));
    });
  }

  setTempo(tempo: number): void {
    const value = String(tempo);
    if (this.tempo.value !== value) this.tempo.value = value;
  }

  setTime(sec: number): void {
    const t = formatTime(sec);
    if (t === this.lastTime) return;
    this.lastTime = t;
    this.time.textContent = t;
  }

  setPlaying(playing: boolean): void {
    if (playing === this.lastPlaying) return;
    this.lastPlaying = playing;
    this.play.textContent = playing ? "Pause" : "Play";
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }
}
