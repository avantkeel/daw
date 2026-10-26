import type { Project } from '../core/project';
import type { Id } from '../core/types';

interface Strip {
  element: HTMLElement;
  name: HTMLElement;
  volume: HTMLInputElement;
  readout: HTMLElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
}

export class Mixer {
  private strips = new Map<Id, Strip>();
  private trackOrder = '';

  constructor(private root: HTMLElement, private project: Project) {
    this.project.changed.subscribe(() => this.refresh());
    this.refresh();
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
  }

  private buildStrips(order: string): void {
    this.trackOrder = order;
    this.strips.clear();
    this.root.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'mixer-heading';
    heading.textContent = 'Mixer';
    this.root.append(heading);

    const bank = document.createElement('div');
    bank.className = 'mixer-bank';
    this.root.append(bank);

    for (const track of this.project.getTracks()) {
      const strip = this.createStrip(track.id);
      this.strips.set(track.id, strip);
      bank.append(strip.element);
    }
  }

  private createStrip(trackId: Id): Strip {
    const element = document.createElement('div');
    element.className = 'mixer-strip';

    const name = document.createElement('div');
    name.className = 'mixer-track-name';

    const faderSlot = document.createElement('div');
    faderSlot.className = 'mixer-fader-slot';

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
    element.append(name, faderSlot, readout, buttons);

    return { element, name, volume, readout, mute, solo };
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