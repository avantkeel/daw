import type { Project } from '../core/project';
import type { Id } from '../core/types';

interface Strip {
  element: HTMLElement;
  name: HTMLElement;
  volume: HTMLInputElement;
  readout: HTMLElement;
  meter: HTMLElement;
  meterFill: HTMLElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
}

export class Mixer {
  private strips = new Map<Id, Strip>();
  private trackOrder = '';
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
      const levels = this.getTrackLevels();
      for (const [trackId, strip] of this.strips) {
        const level = levels.get(trackId) ?? 0;
        strip.meterFill.style.height = `${level * 100}%`;
        strip.meter.setAttribute('aria-valuenow', String(Math.round(level * 100)));
      }
      requestAnimationFrame(updateMeters);
    };
    requestAnimationFrame(updateMeters);
  }

  refresh(): void {
    const tracks = this.project.getTracks();
    const order = tracks.map((track) => track.id).join(',');
    if (order !== this.trackOrder) this.buildStrips(order);

    for (const track of tracks) {
      const strip = this.strips.get(track.id);
      if (!strip) continue;
      strip.name.textContent = track.name;
      strip.volume.value = String(track.volume);
      strip.readout.textContent = track.volume === 0 ? '-inf dB' : `${(20 * Math.log10(track.volume)).toFixed(1)} dB`;
      strip.mute.classList.toggle('active', track.muted);
      strip.mute.setAttribute('aria-pressed', String(track.muted));
      strip.solo.classList.toggle('active', track.solo);
      strip.solo.setAttribute('aria-pressed', String(track.solo));
    }
    this.updateScrollControl();
  }

  private buildStrips(order: string): void {
    this.trackOrder = order;
    this.resizeObserver?.disconnect();
    this.strips.clear();
    this.root.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'mixer-heading';
    heading.textContent = 'Mixer';
    this.root.append(heading);

    this.viewport = document.createElement('div');
    this.viewport.className = 'mixer-viewport';
    this.root.append(this.viewport);

    const bank = document.createElement('div');
    bank.className = 'mixer-bank';
    this.viewport.append(bank);

    for (const track of this.project.getTracks()) {
      const strip = this.createStrip(track.id);
      this.strips.set(track.id, strip);
      bank.append(strip.element);
    }

    this.scrollControl = document.createElement('input');
    this.scrollControl.className = 'mixer-scroll-control';
    this.scrollControl.type = 'range';
    this.scrollControl.min = '0';
    this.scrollControl.max = '1';
    this.scrollControl.step = '1';
    this.scrollControl.value = '0';
    this.scrollControl.setAttribute('aria-label', 'Scroll mixer channels');
    this.scrollControl.addEventListener('input', () => {
      this.viewport.scrollLeft = Number(this.scrollControl.value);
    });
    this.viewport.addEventListener('scroll', () => this.updateScrollControl());
    this.root.append(this.scrollControl);

    this.resizeObserver = new ResizeObserver(() => this.updateScrollControl());
    this.resizeObserver.observe(this.viewport);
    this.resizeObserver.observe(bank);
    this.updateScrollControl();
  }

  private createStrip(trackId: Id): Strip {
    const element = document.createElement('div');
    element.className = 'mixer-strip';

    const name = document.createElement('div');
    name.className = 'mixer-track-name';

    const faderSlot = document.createElement('div');
    faderSlot.className = 'mixer-fader-slot';

    const controls = document.createElement('div');
    controls.className = 'mixer-control-row';

    const meter = document.createElement('div');
    meter.className = 'mixer-meter';
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', 'Track audio level');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    meter.setAttribute('aria-valuenow', '0');
    const meterFill = document.createElement('div');
    meterFill.className = 'mixer-meter-fill';
    meter.append(meterFill);

    const volume = document.createElement('input');
    volume.className = 'mixer-fader';
    volume.type = 'range';
    volume.min = '0';
    volume.max = '2';
    volume.step = '0.01';
    volume.setAttribute('aria-label', 'Track volume');
    volume.addEventListener('pointerdown', () => this.project.beginBatch());
    volume.addEventListener('pointerup', () => this.project.endBatch());
    volume.addEventListener('pointercancel', () => this.project.endBatch());
    volume.addEventListener('input', () => this.project.setVolume(trackId, Number(volume.value)));
    faderSlot.append(volume);
    controls.append(meter, faderSlot);

    const readout = document.createElement('output');
    readout.className = 'mixer-readout';

    const buttons = document.createElement('div');
    buttons.className = 'mixer-buttons';
    const mute = this.createButton('M', 'Mute track', () => {
      const track = this.project.getTracks().find((item) => item.id === trackId);
      if (track) this.project.setMuted(trackId, !track.muted);
    });
    const solo = this.createButton('S', 'Solo track', () => {
      const track = this.project.getTracks().find((item) => item.id === trackId);
      if (track) this.project.setSolo(trackId, !track.solo);
    });
    buttons.append(mute, solo);
    element.append(name, buttons, controls, readout);

    return { element, name, volume, readout, meter, meterFill, mute, solo };
  }

  private updateScrollControl(): void {
    if (!this.viewport || !this.scrollControl) return;
    const max = Math.max(0, this.viewport.scrollWidth - this.viewport.clientWidth);
    this.scrollControl.max = String(Math.max(1, max));
    this.scrollControl.value = String(Math.min(max, this.viewport.scrollLeft));
    const progress = max > 0 ? this.viewport.scrollLeft / max : 0;
    this.scrollControl.style.setProperty('--scroll-progress', `${progress * 100}%`);
  }

  private createButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'mixer-toggle';
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', onClick);
    return button;
  }
}