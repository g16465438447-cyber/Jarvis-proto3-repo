import { contextBridge, ipcRenderer } from "electron";
import {
  ExecuteOptions,
  ResourceStats,
  StreamEvent,
  TriggerInstallTaskOptions,
  TriggerProfile,
  TriggerRuntimeEvent,
  TriggerRuntimeInfo,
  TriggerRuntimeResult,
  UiPreferences
} from "../shared/types";

contextBridge.exposeInMainWorld("pilot", {
  preview: (request: string, options?: { sessionId?: string }) => ipcRenderer.invoke("pilot:preview", request, options),
  execute: (options: ExecuteOptions) => ipcRenderer.invoke("pilot:execute", options),
  abort: (runIdOrSessionId: string) => ipcRenderer.invoke("pilot:abort", runIdOrSessionId),
  getRun: (runId: string) => ipcRenderer.invoke("pilot:getRun", runId),
  onEvent: (listener: (event: StreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: StreamEvent) => {
      listener(payload);
    };
    ipcRenderer.on("pilot:event", handler);
    return () => {
      ipcRenderer.off("pilot:event", handler);
    };
  }
});

contextBridge.exposeInMainWorld("ui", {
  getPreferences: (): Promise<UiPreferences> => ipcRenderer.invoke("ui:getPreferences"),
  setPreferences: (next: Partial<UiPreferences>): Promise<UiPreferences> => ipcRenderer.invoke("ui:setPreferences", next),
  getResourceStats: (): Promise<ResourceStats> => ipcRenderer.invoke("ui:getResourceStats")
});

contextBridge.exposeInMainWorld("trigger", {
  listProfiles: (): Promise<TriggerProfile[]> => ipcRenderer.invoke("trigger:listProfiles"),
  saveProfile: (profile: TriggerProfile): Promise<TriggerProfile[]> => ipcRenderer.invoke("trigger:saveProfile", profile),
  deleteProfile: (profileId: string): Promise<TriggerProfile[]> => ipcRenderer.invoke("trigger:deleteProfile", profileId),
  start: (profileId: string): Promise<TriggerRuntimeInfo> => ipcRenderer.invoke("trigger:start", profileId),
  stop: (profileId: string): Promise<boolean> => ipcRenderer.invoke("trigger:stop", profileId),
  listRunning: (): Promise<TriggerRuntimeInfo[]> => ipcRenderer.invoke("trigger:listRunning"),
  installTask: (options: TriggerInstallTaskOptions): Promise<TriggerRuntimeResult> =>
    ipcRenderer.invoke("trigger:installTask", options),
  onEvent: (listener: (event: TriggerRuntimeEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TriggerRuntimeEvent) => {
      listener(payload);
    };
    ipcRenderer.on("trigger:event", handler);
    return () => {
      ipcRenderer.off("trigger:event", handler);
    };
  }
});
