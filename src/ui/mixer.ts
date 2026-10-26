import type { Project } from "../core/project";
import type { Id } from "../core/types";

const INSERT_SLOTS = 10;
const METER_SEGMENT = 3;
const METER_PITCH = 4;

/** Fader law: dB stops against fader position (0 = bottom, 1 = top). Straight lines in between. */
const MAX_DB = 20 * Math.log10(2);
const FADER_STOPS: ReadonlyArray<readonly [number, number]> = [
  [-60, 0.06],
  [-40, 0.2],
  [-30, 0.32],
  [-20, 0.46],
  [-10, 0.62],
  [0, 0.8],
  [MAX_DB, 1],
];
const SCALE_MARKS = [6, 0, -10, -20, -30, -40, -60];
const SILENT_GAIN = 0.001;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const dbToPos = (db: number): number => {
  if (db <= FADER_STOPS[0][0]) return FADER_STOPS[0][1];
  for (let i = 1; i < FADER_STOPS.length; i++) {
    const [db0, pos0] = FADER_STOPS[i - 1];
    const [db1, pos1] = FADER_STOPS[i];
    if (db <= db1) return pos0 + ((db - db0) / (db1 - db0)) * (pos1 - pos0);
  }
  return 1;
};

const posToDb = (pos: number): number => {
  for (let i = 1; i < FADER_STOPS.length; i++) {
    const [db0, pos0] = FADER_STOPS[i - 1];
    const [db1, pos1] = FADER_STOPS[i];
    if (pos <= pos1) return db0 + ((pos - pos0) / (pos1 - pos0)) * (db1 - db0);
  }
  return MAX_DB;
};

const gainToPos = (gain: number): number => {
  if (gain <= 0) return 0;
  if (gain < SILENT_GAIN) return (FADER_STOPS[0][1] * gain) / SILENT_GAIN;
  return dbToPos(20 * Math.log10(gain));
};

const posToGain = (pos: number): number => {
  const p = clamp01(pos);
  if (p <= 0) return 0;
  if (p < FADER_STOPS[0][1]) return (SILENT_GAIN * p) / FADER_STOPS[0][1];
  return Math.min(2, Math.pow(10, posToDb(p) / 20));
};

/** The engine reports levels as (dB + 60) / 60, so 0 is silence and 1 is 0 dB. */
const levelToDb = (level: number): number => level * 60 - 60;
const levelToPos = (level: number): number =>
  level <= 0 ? 0 : dbToPos(levelToDb(level));

const formatDb = (db: number): string =>
  db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
const formatGain = (gain: number): string =>
  gain <= 0 ? "-inf" : formatDb(20 * Math.log10(gain));
const formatLevel = (level: number): string =>
  level <= 0 ? "-inf" : formatDb(levelToDb(level));

const AMBER_FROM = dbToPos(-18);
const RED_FROM = dbToPos(-3);

interface Strip {
  element: HTMLElement;
  name: HTMLElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
  volumeReadout: HTMLElement;
  peakReadout: HTMLButtonElement;
  slot: HTMLElement;
  cap: HTMLElement;
  meter: HTMLElement;
  meterCanvases: HTMLCanvasElement[];
  lastLevel: number;
  peak: number;
}

export class Mixer {
  private strips = new Map<Id, Strip>();
  private trackOrder = "";
  private viewport!: HTMLElement;
  private scrollControl!: HTMLInputElement;
  private resizeObserver?: ResizeObserver;

  constructor(
    private root: HTMLElement,
    private project: Project,
    private getTrackLevels: () => ReadonlyMap<Id, number>,
  ) {
    this.project.changed.subscribe(() => this.refresh());
    this.refresh();
    const updateMeters = () => {
      if (!this.root.hidden) this.updateMeters();
      requestAnimationFrame(updateMeters);
    };
    requestAnimationFrame(updateMeters);
  }

  refresh(): void {
    const tracks = this.project.getTracks();
    const order = tracks
      .map((track) => `${track.id}:${track.channels}`)
      .join(",");
    if (order !== this.trackOrder) this.buildStrips(order);

    for (const track of tracks) {
      const strip = this.strips.get(track.id);
      if (!strip) continue;
      strip.name.textContent = track.name;
      strip.name.title = track.name;
      strip.volumeReadout.textContent = formatGain(track.volume);
      strip.cap.style.bottom = `${gainToPos(track.volume) * 100}%`;
      strip.slot.setAttribute("aria-valuenow", strip.volumeReadout.textContent);
      strip.mute.classList.toggle("active", track.muted);
      strip.mute.setAttribute("aria-pressed", String(track.muted));
      strip.solo.classList.toggle("active", track.solo);
      strip.solo.setAttribute("aria-pressed", String(track.solo));
    }
    this.updateScrollControl();
  }

  private updateMeters(): void {
    const levels = this.getTrackLevels();
    for (const [trackId, strip] of this.strips) {
      const level = levels.get(trackId) ?? 0;
      if (level > strip.peak) {
        strip.peak = level;
        strip.peakReadout.textContent = formatLevel(level);
      }
      if (level === strip.lastLevel) continue;
      strip.lastLevel = level;
      strip.meter.setAttribute(
        "aria-valuenow",
        String(Math.round(level * 100)),
      );
      this.drawMeter(strip);
    }
  }

  private resetPeak(strip: Strip): void {
    strip.peak = 0;
    strip.peakReadout.textContent = "-inf";
  }

  private sizeMeter(strip: Strip): void {
    const ratio = window.devicePixelRatio || 1;
    const height = Math.round(strip.meter.clientHeight * ratio);
    for (const canvas of strip.meterCanvases) {
      const width = Math.round(canvas.clientWidth * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    this.drawMeter(strip);
  }

  private drawMeter(strip: Strip): void {
    const ratio = window.devicePixelRatio || 1;
    for (const canvas of strip.meterCanvases) {
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0 || canvas.height === 0) continue;
      const pitch = METER_PITCH * ratio;
      const segment = METER_SEGMENT * ratio;
      const count = Math.max(1, Math.floor(canvas.height / pitch));
      const lit = levelToPos(strip.lastLevel < 0 ? 0 : strip.lastLevel);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < count; i++) {
        const position = (i + 0.5) / count;
        if (position < lit) {
          ctx.fillStyle =
            position >= RED_FROM
              ? "#c0584f"
              : position >= AMBER_FROM
                ? "#c9b45a"
                : "#55b58a";
        } else {
          ctx.fillStyle = "#3a3c3e";
        }
        ctx.fillRect(
          0,
          canvas.height - i * pitch - segment,
          canvas.width,
          segment,
        );
      }
    }
  }

  private buildStrips(order: string): void {
    this.trackOrder = order;
    this.resizeObserver?.disconnect();
    this.strips.clear();
    this.root.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "mixer-heading";
    heading.textContent = "Mixer";
    this.root.append(heading);

    this.viewport = document.createElement("div");
    this.viewport.className = "mixer-viewport";
    this.root.append(this.viewport);

    const bank = document.createElement("div");
    bank.className = "mixer-bank";
    this.viewport.append(bank);

    for (const track of this.project.getTracks()) {
      const strip = this.createStrip(track.id, track.channels);
      this.strips.set(track.id, strip);
      bank.append(strip.element);
    }

    this.scrollControl = document.createElement("input");
    this.scrollControl.className = "mixer-scroll-control";
    this.scrollControl.type = "range";
    this.scrollControl.min = "0";
    this.scrollControl.max = "1";
    this.scrollControl.step = "1";
    this.scrollControl.value = "0";
    this.scrollControl.setAttribute("aria-label", "Scroll mixer channels");
    this.scrollControl.addEventListener("input", () => {
      this.viewport.scrollLeft = Number(this.scrollControl.value);
    });
    this.viewport.addEventListener("scroll", () => this.updateScrollControl());
    this.root.append(this.scrollControl);

    this.resizeObserver = new ResizeObserver(() => {
      this.updateScrollControl();
      for (const strip of this.strips.values()) this.sizeMeter(strip);
    });
    this.resizeObserver.observe(this.viewport);
    this.resizeObserver.observe(bank);
    for (const strip of this.strips.values())
      this.resizeObserver.observe(strip.meter);
    this.updateScrollControl();
  }

  private createStrip(trackId: Id, channels: 1 | 2): Strip {
    const element = document.createElement("div");
    element.className = "mixer-strip";

    const inserts = document.createElement("div");
    inserts.className = "mixer-inserts";
    for (let i = 0; i < INSERT_SLOTS; i++) {
      const insert = document.createElement("div");
      insert.className = "mixer-insert";
      inserts.append(insert);
    }

    const buttons = document.createElement("div");
    buttons.className = "mixer-buttons";
    const solo = this.createButton("S", "Solo track", () => {
      const track = this.project
        .getTracks()
        .find((item) => item.id === trackId);
      if (track) this.project.setSolo(trackId, !track.solo);
    });
    const mute = this.createButton("M", "Mute track", () => {
      const track = this.project
        .getTracks()
        .find((item) => item.id === trackId);
      if (track) this.project.setMuted(trackId, !track.muted);
    });
    buttons.append(solo, mute);

    const readouts = document.createElement("div");
    readouts.className = "mixer-readouts";
    const volumeReadout = document.createElement("output");
    volumeReadout.className = "mixer-readout";
    volumeReadout.title = "Track volume (dB)";
    const peakReadout = document.createElement("button");
    peakReadout.className = "mixer-readout mixer-peak";
    peakReadout.type = "button";
    peakReadout.textContent = "-inf";
    peakReadout.title =
      "Peak level (dB). Click to reset, Ctrl-click to reset all.";
    readouts.append(volumeReadout, peakReadout);

    const faderArea = document.createElement("div");
    faderArea.className = "mixer-fader-area";

    const scale = document.createElement("div");
    scale.className = "mixer-scale";
    for (const db of SCALE_MARKS) {
      const mark = document.createElement("div");
      mark.className = "mixer-scale-mark";
      mark.textContent = db > 0 ? `+${db}` : String(db);
      mark.style.bottom = `${dbToPos(db) * 100}%`;
      scale.append(mark);
    }
    const infMark = document.createElement("div");
    infMark.className = "mixer-scale-mark";
    infMark.textContent = "∞";
    infMark.style.bottom = "0%";
    scale.append(infMark);

    const slot = document.createElement("div");
    slot.className = "mixer-fader-slot";
    slot.tabIndex = 0;
    slot.setAttribute("role", "slider");
    slot.setAttribute("aria-label", "Track volume");
    slot.setAttribute("aria-orientation", "vertical");
    slot.setAttribute("aria-valuemin", "-inf");
    slot.setAttribute("aria-valuemax", formatDb(MAX_DB));
    const travel = document.createElement("div");
    travel.className = "mixer-fader-travel";
    const groove = document.createElement("div");
    groove.className = "mixer-groove";
    const cap = document.createElement("div");
    cap.className = "mixer-fader-cap";
    travel.append(groove, cap);
    slot.append(travel);
    this.attachFader(trackId, slot, travel, cap);

    const meter = document.createElement("div");
    meter.className = "mixer-meter";
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-label", "Track audio level");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", "0");
    const meterCanvases = Array.from({ length: channels }, () => {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      meter.append(canvas);
      return canvas;
    });

    faderArea.append(scale, slot, meter);

    const plate = document.createElement("div");
    plate.className = "mixer-name-plate";
    const name = document.createElement("div");
    name.className = "mixer-track-name";
    plate.append(name);

    element.append(inserts, buttons, readouts, faderArea, plate);

    const strip: Strip = {
      element,
      name,
      mute,
      solo,
      volumeReadout,
      peakReadout,
      slot,
      cap,
      meter,
      meterCanvases,
      lastLevel: -1,
      peak: 0,
    };
    peakReadout.addEventListener("click", (event) => {
      if (event.ctrlKey || event.altKey)
        for (const other of this.strips.values()) this.resetPeak(other);
      else this.resetPeak(strip);
    });
    return strip;
  }

  private attachFader(
    trackId: Id,
    slot: HTMLElement,
    travel: HTMLElement,
    cap: HTMLElement,
  ): void {
    let dragging = false;
    let grabOffset = 0;

    const currentGain = (): number =>
      this.project.getTracks().find((item) => item.id === trackId)?.volume ?? 1;
    const setFromPointer = (clientY: number) => {
      const rect = travel.getBoundingClientRect();
      if (rect.height <= 0) return;
      this.project.setVolume(
        trackId,
        posToGain((rect.bottom - (clientY - grabOffset)) / rect.height),
      );
    };
    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      slot.classList.remove("dragging");
      if (slot.hasPointerCapture(event.pointerId))
        slot.releasePointerCapture(event.pointerId);
      this.project.endBatch();
    };

    slot.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      slot.focus();
      if (event.ctrlKey || event.altKey) {
        this.project.setVolume(trackId, 1);
        return;
      }
      const onCap = event.target === cap;
      const capRect = cap.getBoundingClientRect();
      grabOffset = onCap
        ? event.clientY - (capRect.top + capRect.height / 2)
        : 0;
      dragging = true;
      slot.classList.add("dragging");
      slot.setPointerCapture(event.pointerId);
      this.project.beginBatch();
      if (!onCap) setFromPointer(event.clientY);
    });
    slot.addEventListener("pointermove", (event) => {
      if (dragging) setFromPointer(event.clientY);
    });
    slot.addEventListener("pointerup", endDrag);
    slot.addEventListener("pointercancel", endDrag);
    slot.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 0.05 : 0.01;
      let delta = 0;
      if (event.key === "ArrowUp" || event.key === "ArrowRight") delta = step;
      else if (event.key === "ArrowDown" || event.key === "ArrowLeft")
        delta = -step;
      else return;
      event.preventDefault();
      this.project.setVolume(
        trackId,
        posToGain(gainToPos(currentGain()) + delta),
      );
    });
  }

  private updateScrollControl(): void {
    if (!this.viewport || !this.scrollControl) return;
    const max = Math.max(
      0,
      this.viewport.scrollWidth - this.viewport.clientWidth,
    );
    this.scrollControl.max = String(Math.max(1, max));
    this.scrollControl.value = String(Math.min(max, this.viewport.scrollLeft));
    const progress = max > 0 ? this.viewport.scrollLeft / max : 0;
    this.scrollControl.style.setProperty(
      "--scroll-progress",
      `${progress * 100}%`,
    );
  }

  private createButton(
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "mixer-toggle";
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", onClick);
    return button;
  }
}
