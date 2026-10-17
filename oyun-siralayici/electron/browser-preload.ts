import { contextBridge, ipcRenderer } from "electron";
const allowed = new Set([
  "state",
  "new",
  "navigate",
  "select",
  "close",
  "back",
  "forward",
  "reload",
  "stop",
]);
contextBridge.exposeInMainWorld("browserChrome", {
  command: (action: string, args: unknown = {}) =>
    allowed.has(action)
      ? ipcRenderer.invoke("browser:command", action, args)
      : Promise.reject(new Error("Geçersiz komut.")),
  onState: (callback: (state: unknown) => void) => {
    const listener = (_e: unknown, state: unknown) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  },
  onFocus: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("browser:focus", listener);
    return () => ipcRenderer.removeListener("browser:focus", listener);
  },
});
