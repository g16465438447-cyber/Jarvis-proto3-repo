"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("pilot", {
    preview: (request, options) => electron_1.ipcRenderer.invoke("pilot:preview", request, options),
    execute: (options) => electron_1.ipcRenderer.invoke("pilot:execute", options),
    abort: (runIdOrSessionId) => electron_1.ipcRenderer.invoke("pilot:abort", runIdOrSessionId),
    getRun: (runId) => electron_1.ipcRenderer.invoke("pilot:getRun", runId),
    onEvent: (listener) => {
        const handler = (_event, payload) => {
            listener(payload);
        };
        electron_1.ipcRenderer.on("pilot:event", handler);
        return () => {
            electron_1.ipcRenderer.off("pilot:event", handler);
        };
    }
});
electron_1.contextBridge.exposeInMainWorld("ui", {
    getPreferences: () => electron_1.ipcRenderer.invoke("ui:getPreferences"),
    setPreferences: (next) => electron_1.ipcRenderer.invoke("ui:setPreferences", next),
    getResourceStats: () => electron_1.ipcRenderer.invoke("ui:getResourceStats")
});
electron_1.contextBridge.exposeInMainWorld("trigger", {
    listProfiles: () => electron_1.ipcRenderer.invoke("trigger:listProfiles"),
    saveProfile: (profile) => electron_1.ipcRenderer.invoke("trigger:saveProfile", profile),
    deleteProfile: (profileId) => electron_1.ipcRenderer.invoke("trigger:deleteProfile", profileId),
    start: (profileId) => electron_1.ipcRenderer.invoke("trigger:start", profileId),
    stop: (profileId) => electron_1.ipcRenderer.invoke("trigger:stop", profileId),
    listRunning: () => electron_1.ipcRenderer.invoke("trigger:listRunning"),
    installTask: (options) => electron_1.ipcRenderer.invoke("trigger:installTask", options),
    onEvent: (listener) => {
        const handler = (_event, payload) => {
            listener(payload);
        };
        electron_1.ipcRenderer.on("trigger:event", handler);
        return () => {
            electron_1.ipcRenderer.off("trigger:event", handler);
        };
    }
});
