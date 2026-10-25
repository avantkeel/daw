/**
 * Everything the app needs from the host (desktop shell, browser, Tauri, ...).
 * Keep this tiny. Add methods here, implement them per host.
 */
export interface Platform {
  readonly name: string;
  /** Returns true if saved, false if cancelled. */
  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean>;
}
