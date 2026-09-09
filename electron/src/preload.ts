import { contextBridge, ipcRenderer } from "electron";

// レンダラー(React)側からは window.aiOffice.pickFolder() として使う。
// ブラウザ単体で開いた場合はこのオブジェクト自体が存在しないため、
// フロントエンド側は window.aiOffice の有無で機能の出し分けを行う。
contextBridge.exposeInMainWorld("aiOffice", {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("pick-folder"),
});
