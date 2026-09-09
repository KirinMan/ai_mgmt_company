import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { fork, ChildProcess } from "node:child_process";
import path from "node:path";

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// AI社員に作業させるフォルダをネイティブのフォルダ選択ダイアログで選べるようにする。
// ブラウザ単体で開いた場合はこの IPC が使えないため、フロントエンド側は
// window.aiOffice の有無で「フォルダを選ぶ」ボタンの表示を切り替える。
ipcMain.handle("pick-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/**
 * 開発時は npm run dev (concurrently) が server/web を別プロセスで既に起動しているので
 * ここでは何もしない。パッケージ済みアプリではバンドルされた server/dist/server.js を
 * 子プロセスとして起動する。
 */
function startBackendIfPackaged() {
  if (DEV_SERVER_URL) return;

  const serverEntry = path.join(process.resourcesPath, "server", "dist", "server.js");
  serverProcess = fork(serverEntry, [], {
    cwd: path.dirname(serverEntry),
    env: { ...process.env, PORT: "4000" },
    silent: false,
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "AI社員オフィス",
    backgroundColor: "#0e1220",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.resourcesPath, "web", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  startBackendIfPackaged();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  serverProcess?.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  serverProcess?.kill();
});
