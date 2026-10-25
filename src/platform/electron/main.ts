import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { IPC_SAVE_FILE } from './ipc-channels';

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
