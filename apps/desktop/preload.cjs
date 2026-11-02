// Exposes the encrypted secret store to the UI (window.zappSecrets, see ui/src/app/settings.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zappSecrets', {
  get: (name) => ipcRenderer.invoke('secrets:get', String(name)),
  set: (name, value) =>
    ipcRenderer.invoke(
      'secrets:set',
      String(name),
      value === undefined ? undefined : String(value),
    ),
});
