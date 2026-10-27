import type {
  OpenedProject,
  MixerAction,
  MixerState,
  Platform,
  ProjectLocation,
  SaveProjectRequest,
} from "../platform";
import type { DawBridge } from "./bridge";

/** Renderer-side adapter: Platform interface -> Electron preload bridge. */
export class ElectronPlatform implements Platform {
  readonly name = "electron";
  readonly supportsMixerWindow = true;

  constructor(private bridge: DawBridge) {}

  toggleMixerWindow(): Promise<boolean> {
    return this.bridge.toggleMixerWindow();
  }

  updateMixerState(state: MixerState): void {
    this.bridge.updateMixerState(state);
  }

  onMixerAction(handler: (action: MixerAction) => void): void {
    this.bridge.onMixerAction(handler);
  }

  onMixerState(handler: (state: MixerState) => void): void {
    this.bridge.onMixerState(handler);
  }

  onMixerReady(handler: () => void): void {
    this.bridge.onMixerReady(handler);
  }

  onMixerWindowClosed(handler: () => void): void {
    this.bridge.onMixerWindowClosed(handler);
  }

  sendMixerAction(action: MixerAction): void {
    this.bridge.sendMixerAction(action);
  }

  notifyMixerReady(): void {
    this.bridge.notifyMixerReady();
  }

  saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean> {
    return this.bridge.saveFile(suggestedName, data);
  }

  saveProject(request: SaveProjectRequest): Promise<ProjectLocation | null> {
    return this.bridge.saveProject(request);
  }

  openProject(fileExtension: string): Promise<OpenedProject | null> {
    return this.bridge.openProject(fileExtension);
  }

  readFile(path: string): Promise<ArrayBuffer> {
    return this.bridge.readFile(path);
  }

  copyFileIntoProject(
    project: ProjectLocation,
    subfolder: string,
    sourcePath: string,
  ): Promise<string> {
    return this.bridge.copyFileIntoProject(project, subfolder, sourcePath);
  }

  setDirty(dirty: boolean): void {
    this.bridge.setDirty(dirty);
  }

  onCloseRequested(handler: () => void): void {
    this.bridge.onCloseRequested(handler);
  }

  quit(): Promise<void> {
    return this.bridge.quit();
  }

  getFilePath(file: File): string | undefined {
    try {
      return this.bridge.getFilePath(file) || undefined;
    } catch {
      return undefined;
    }
  }
}
