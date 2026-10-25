import type { OpenedProject, Platform, ProjectLocation, SaveProjectRequest } from '../platform';
import type { DawBridge } from './bridge';

/** Renderer-side adapter: Platform interface -> Electron preload bridge. */
export class ElectronPlatform implements Platform {
  readonly name = 'electron';

  constructor(private bridge: DawBridge) {}

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
