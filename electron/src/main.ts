import { app, BrowserWindow } from "electron";
import { fork, ChildProcess } from "node:child_process";
import path from "node:path";

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

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
