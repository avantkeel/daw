import type { Platform } from '../platform';

/** Browser fallback: triggers a normal download. Also proves the app doesn't need Electron. */
export class WebPlatform implements Platform {
  readonly name = 'web';

  async saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean> {
    const url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
}
