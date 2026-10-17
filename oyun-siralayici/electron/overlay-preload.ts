import { contextBridge, ipcRenderer } from "electron";
// Overlay windows (HUD and Ctrl+Tab panel) talk only to the overlay manager.
contextBridge.exposeInMainWorld("overlay", {
  call: (method: string, args?: unknown) => ipcRenderer.invoke("overlay:call", method, args),
  onData: (callback: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on("overlay:data", handler);
    return () => ipcRenderer.removeListener("overlay:data", handler);
  },
});
