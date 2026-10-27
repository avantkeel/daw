import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DawBridge } from "./bridge";
import {
  IPC_CLOSE_REQUESTED,
  IPC_COPY_TO_PROJECT,
  IPC_MIXER_ACTION,
  IPC_MIXER_READY,
  IPC_MIXER_STATE,
  IPC_MIXER_WINDOW_CLOSED,
  IPC_MIXER_WINDOW_READY,
  IPC_OPEN_PROJECT,
  IPC_QUIT,
  IPC_READ_FILE,
  IPC_SAVE_FILE,
  IPC_SAVE_PROJECT,
  IPC_SET_DIRTY,
  IPC_TOGGLE_MIXER,
} from "./ipc-channels";

const bridge: DawBridge = {
  toggleMixerWindow: () => ipcRenderer.invoke(IPC_TOGGLE_MIXER),
  updateMixerState: (state) => ipcRenderer.send(IPC_MIXER_STATE, state),
  onMixerAction: (handler) => {
    ipcRenderer.on(IPC_MIXER_ACTION, (_event, action) => handler(action));
  },
  onMixerState: (handler) => {
    ipcRenderer.on(IPC_MIXER_STATE, (_event, state) => handler(state));
  },
  onMixerReady: (handler) => {
    ipcRenderer.on(IPC_MIXER_WINDOW_READY, handler);
  },
  onMixerWindowClosed: (handler) => {
    ipcRenderer.on(IPC_MIXER_WINDOW_CLOSED, handler);
  },
  sendMixerAction: (action) => ipcRenderer.send(IPC_MIXER_ACTION, action),
  notifyMixerReady: () => ipcRenderer.send(IPC_MIXER_READY),
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
