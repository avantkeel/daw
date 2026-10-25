/** Where a project was saved. `location` is opaque and host-specific (a folder path on desktop). */
export interface ProjectLocation {
  location: string;
  /** Project name (also the name of the project folder and file). */
  name: string;
}

export interface OpenedProject {
  location: ProjectLocation;
  content: string;
}

export interface SaveProjectRequest {
  suggestedName: string;
  /** e.g. ".audioproject" */
  fileExtension: string;
  content: string;
  /** If set, save there without asking. */
  existing?: ProjectLocation;
}

/**
 * Everything the app needs from the host (desktop shell, browser, Tauri, ...).
 * Keep this tiny. Add methods here, implement them per host.
 */
export interface Platform {
  readonly name: string;
  /** Returns true if saved, false if cancelled. */
  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean>;
  /**
   * Saves a project as `<chosen name>/<chosen name><fileExtension>`.
   * Asks where to save unless `existing` is given. Returns null if cancelled.
   */
  saveProject(request: SaveProjectRequest): Promise<ProjectLocation | null>;
  /** Asks the user for a project file with this extension (e.g. ".audioproject"). Null if cancelled. */
  openProject(fileExtension: string): Promise<OpenedProject | null>;
  /** Reads a local file by absolute path (used to reload audio referenced by a project). */
  readFile(path: string): Promise<ArrayBuffer>;
  /** Absolute path of a dropped file, or undefined if the host can't tell (e.g. browsers). */
  getFilePath(file: File): string | undefined;
}
