/** Shape of what preload.ts exposes on `window`. */
export interface DawBridge {
  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean>;
}

declare global {
  interface Window {
    dawBridge?: DawBridge;
  }
}
