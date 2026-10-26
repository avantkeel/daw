import type { Id } from "../core/types";
import { computePeaks, type Peaks } from "./peaks";

interface Asset {
  buffer: AudioBuffer;
  peaks: Peaks;
}

/** Holds decoded audio. The project only references assets by id. */
export class AssetStore {
  private items = new Map<Id, Asset>();
  private seq = 0;

  constructor(private ctx: BaseAudioContext) {}

  async importFile(
    file: File,
  ): Promise<{
    assetId: Id;
    name: string;
    duration: number;
    sampleRate: number;
    channels: number;
  }> {
    const asset = await this.importBuffer(await file.arrayBuffer());
    return { ...asset, name: file.name };
  }

  async importBuffer(
    data: ArrayBuffer,
  ): Promise<{
    assetId: Id;
    duration: number;
    sampleRate: number;
    channels: number;
  }> {
    const buffer = await this.ctx.decodeAudioData(data);
    const assetId = `asset_${++this.seq}`;
    this.items.set(assetId, { buffer, peaks: computePeaks(buffer) });
    return {
      assetId,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
  }

  clear(): void {
    this.items.clear();
  }

  getBuffer(id: Id): AudioBuffer | undefined {
    return this.items.get(id)?.buffer;
  }

  getPeaks(id: Id): Peaks | undefined {
    return this.items.get(id)?.peaks;
  }
}
