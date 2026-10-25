import type { Platform } from '../platform';
import type { DawBridge } from './bridge';

/** Renderer-side adapter: Platform interface -> Electron preload bridge. */
export class ElectronPlatform implements Platform {
  readonly name = 'electron';

  constructor(private bridge: DawBridge) {}

  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean> {
    return this.bridge.saveFile(suggestedName, data);
  }
}
