import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OpenedProject, ProjectLocation, SaveProjectRequest } from '../platform';
import { IPC_OPEN_PROJECT, IPC_READ_FILE, IPC_SAVE_FILE, IPC_SAVE_PROJECT } from './ipc-channels';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
    backgroundColor: '#1e1e1e',
    title: 'DAW',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle(IPC_SAVE_FILE, async (_event, suggestedName: string, data: ArrayBuffer) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: [{ name: 'WAV audio', extensions: ['wav'] }],
  });
  if (canceled || !filePath) return false;
  await fs.writeFile(filePath, Buffer.from(data));
  return true;
});

// Creates <chosen path>/ and writes <chosen path>/<name><extension> inside it.
ipcMain.handle(IPC_SAVE_PROJECT, async (_event, req: SaveProjectRequest): Promise<ProjectLocation | null> => {
  let folder: string;
  let name: string;

  if (req.existing) {
    folder = req.existing.location;
    name = req.existing.name;
  } else {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save project',
      defaultPath: req.suggestedName,
      buttonLabel: 'Save',
      properties: ['createDirectory'],
    });
    if (canceled || !filePath) return null;
    folder = filePath;
    name = path.basename(filePath);
    if (name.toLowerCase().endsWith(req.fileExtension)) {
      name = name.slice(0, -req.fileExtension.length);
      folder = path.join(path.dirname(filePath), name);
    }
  }

  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, `${name}${req.fileExtension}`), req.content, 'utf8');
  return { location: folder, name };
});

ipcMain.handle(IPC_OPEN_PROJECT, async (_event, fileExtension: string): Promise<OpenedProject | null> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open project',
    properties: ['openFile'],
    filters: [{ name: 'Audio project', extensions: [fileExtension.replace(/^\./, '')] }],
  });
  const filePath = filePaths[0];
  if (canceled || !filePath) return null;
  const content = await fs.readFile(filePath, 'utf8');
  return {
    content,
    location: { location: path.dirname(filePath), name: path.basename(filePath, path.extname(filePath)) },
  };
});

// Only audio files can be read this way, so the renderer can't be used to read arbitrary files.
const READABLE_AUDIO = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aif', '.aiff', '.m4a']);

ipcMain.handle(IPC_READ_FILE, async (_event, filePath: string): Promise<ArrayBuffer> => {
  if (!READABLE_AUDIO.has(path.extname(filePath).toLowerCase())) throw new Error('Not an audio file');
  const buf = await fs.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
