import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DawBridge } from "./bridge";
import {
  IPC_CLOSE_REQUESTED,
  IPC_COPY_TO_PROJECT,
  IPC_OPEN_PROJECT,
  IPC_QUIT,
  IPC_READ_FILE,
  IPC_SAVE_FILE,
  IPC_SAVE_PROJECT,
  IPC_SET_DIRTY,
} from "./ipc-channels";

const bridge: DawBridge = {
  saveFile: (suggestedName, data) =>
    ipcRenderer.invoke(IPC_SAVE_FILE, suggestedName, data),
  saveProject: (request) => ipcRenderer.invoke(IPC_SAVE_PROJECT, request),
  openProject: (fileExtension) =>
    ipcRenderer.invoke(IPC_OPEN_PROJECT, fileExtension),
  readFile: (path) => ipcRenderer.invoke(IPC_READ_FILE, path),
  copyFileIntoProject: (project, subfolder, sourcePath) =>
    ipcRenderer.invoke(IPC_COPY_TO_PROJECT, project, subfolder, sourcePath),
  getFilePath: (file) => webUtils.getPathForFile(file),
  setDirty: (dirty) => ipcRenderer.send(IPC_SET_DIRTY, dirty),
  onCloseRequested: (handler) => {
    ipcRenderer.on(IPC_CLOSE_REQUESTED, () => handler());
  },
  quit: () => ipcRenderer.invoke(IPC_QUIT),
};

contextBridge.exposeInMainWorld("dawBridge", bridge);
