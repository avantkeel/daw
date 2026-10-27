import type {
  OpenedProject,
  MixerAction,
  MixerState,
  ProjectLocation,
  SaveProjectRequest,
} from "../platform";

/** Shape of what preload.ts exposes on `window`. */
export interface DawBridge {
  toggleMixerWindow(): Promise<boolean>;
  updateMixerState(state: MixerState): void;
  onMixerAction(handler: (action: MixerAction) => void): void;
  onMixerState(handler: (state: MixerState) => void): void;
  onMixerReady(handler: () => void): void;
  onMixerWindowClosed(handler: () => void): void;
  sendMixerAction(action: MixerAction): void;
  notifyMixerReady(): void;
  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean>;
  saveProject(request: SaveProjectRequest): Promise<ProjectLocation | null>;
  openProject(fileExtension: string): Promise<OpenedProject | null>;
  readFile(path: string): Promise<ArrayBuffer>;
  copyFileIntoProject(
    project: ProjectLocation,
    subfolder: string,
    sourcePath: string,
  ): Promise<string>;
  getFilePath(file: File): string;
  setDirty(dirty: boolean): void;
  onCloseRequested(handler: () => void): void;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    dawBridge?: DawBridge;
  }
}
