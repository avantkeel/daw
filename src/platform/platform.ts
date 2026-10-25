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
  /**
   * Copies an audio file into `<project folder>/<subfolder>/` (never overwriting; a name clash gets a suffix).
   * Returns the absolute path of the copy.
   */
  copyFileIntoProject(project: ProjectLocation, subfolder: string, sourcePath: string): Promise<string>;
  /** Absolute path of a dropped file, or undefined if the host can't tell (e.g. browsers). */
  getFilePath(file: File): string | undefined;
  /**
   * Tells the host whether there are unsaved changes, so it can guard against the window or tab being closed.
   */
  setDirty(dirty: boolean): void;
  /**
   * The host calls `handler` when the user tries to close the window while there are unsaved changes (desktop).
   * The app decides what to do and calls `quit()` when it is fine to close. Browsers show their own prompt instead.
   */
  onCloseRequested(handler: () => void): void;
  /** Closes the application. */
  quit(): Promise<void>;
}
