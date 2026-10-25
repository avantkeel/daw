import type { OpenedProject, Platform, ProjectLocation, SaveProjectRequest } from '../platform';

/** Browser fallback: triggers normal downloads. Also proves the app doesn't need Electron. */
export class WebPlatform implements Platform {
  readonly name = 'web';

  async saveFile(suggestedName: string, data: ArrayBuffer): Promise<boolean> {
    this.download(suggestedName, new Blob([data], { type: 'audio/wav' }));
    return true;
  }

  /** Browsers can't create folders, so this downloads just the project file. */
  async saveProject(req: SaveProjectRequest): Promise<ProjectLocation | null> {
    const name = req.existing?.name ?? req.suggestedName;
    const fileName = `${name}${req.fileExtension}`;
    this.download(fileName, new Blob([req.content], { type: 'application/xml' }));
    return { location: fileName, name };
  }

  openProject(fileExtension: string): Promise<OpenedProject | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = fileExtension;
      input.addEventListener('cancel', () => resolve(null));
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const name = file.name.endsWith(fileExtension) ? file.name.slice(0, -fileExtension.length) : file.name;
        resolve({ content: await file.text(), location: { location: file.name, name } });
      });
      input.click();
    });
  }

  /** Browsers can't read arbitrary paths, so projects opened here have no audio. */
  async readFile(): Promise<ArrayBuffer> {
    throw new Error('Reading local files is not supported in the browser');
  }

  getFilePath(): string | undefined {
    return undefined;
  }

  private download(fileName: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
