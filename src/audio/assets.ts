import type { Id } from '../core/types';
import { computePeaks, type Peaks } from './peaks';

interface Asset {
  buffer: AudioBuffer;
  peaks: Peaks;
}

/** Holds decoded audio. The project only references assets by id. */
export class AssetStore {
  private items = new Map<Id, Asset>();
  private seq = 0;

  constructor(private ctx: BaseAudioContext) {}

  async importFile(file: File): Promise<{ assetId: Id; name: string; duration: number }> {
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    const assetId = `asset_${++this.seq}`;
    this.items.set(assetId, { buffer, peaks: computePeaks(buffer) });
    return { assetId, name: file.name, duration: buffer.duration };
  }

  getBuffer(id: Id): AudioBuffer | undefined {
    return this.items.get(id)?.buffer;
  }

  getPeaks(id: Id): Peaks | undefined {
    return this.items.get(id)?.peaks;
  }
}
