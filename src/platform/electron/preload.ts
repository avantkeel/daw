import { contextBridge, ipcRenderer } from 'electron';
import type { DawBridge } from './bridge';
import { IPC_SAVE_FILE } from './ipc-channels';

const bridge: DawBridge = {
  saveFile: (suggestedName, data) => ipcRenderer.invoke(IPC_SAVE_FILE, suggestedName, data),
};

contextBridge.exposeInMainWorld('dawBridge', bridge);
