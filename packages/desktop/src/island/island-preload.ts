import { contextBridge, ipcRenderer } from "electron";

type IslandStateHandler = (state: unknown) => void;

contextBridge.exposeInMainWorld("paseoIsland", {
  ready: () => ipcRenderer.send("paseo:island:ready"),
  onState: (handler: IslandStateHandler) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => handler(state);
    ipcRenderer.on("paseo:island:state", listener);
    return () => ipcRenderer.removeListener("paseo:island:state", listener);
  },
  setExpanded: (expanded: boolean) => ipcRenderer.send("paseo:island:set-expanded", { expanded }),
  action: (action: "open" | "dismiss" | "clear", id?: string) =>
    ipcRenderer.send("paseo:island:action", { action, id }),
});
