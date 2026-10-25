import type { OpenedProject, ProjectLocation, SaveProjectRequest } from '../platform';

/** Shape of what preload.ts exposes on `window`. */
export interface DawBridge {
  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean>;
  saveProject(request: SaveProjectRequest): Promise<ProjectLocation | null>;
  openProject(fileExtension: string): Promise<OpenedProject | null>;
  readFile(path: string): Promise<ArrayBuffer>;
  getFilePath(file: File): string;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    dawBridge?: DawBridge;
  }
}
