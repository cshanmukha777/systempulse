"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { getSystemSnapshot } = require("./systemService");

const DEV_SERVER_URL = "http://localhost:5173";
const PACKAGED_HTML_PATH = path.join(__dirname, "../dist/index.html");
const PACKAGED_HTML_URL = pathToFileURL(PACKAGED_HTML_PATH).href;

let mainWindow = null;
let snapshotTimer = null;
let snapshotInProgress = false;

function isTrustedUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;

  if (app.isPackaged) {
    return rawUrl.split(/[?#]/, 1)[0] === PACKAGED_HTML_URL;
  }

  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "http:" &&
      url.hostname === "localhost" &&
      url.port === "5173"
    );
  } catch {
    return false;
  }
}

function isTrustedIpcSender(event) {
  return Boolean(
    event.senderFrame &&
      event.senderFrame === event.sender.mainFrame &&
      isTrustedUrl(event.senderFrame.url)
  );
}

function registerIpcHandlers() {
  ipcMain.handle("system:get-snapshot", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Rejected IPC request from an untrusted frame");
    }

    return getSystemSnapshot();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "SystemPulse — Smart Desktop System Monitor",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (app.isPackaged) {
    mainWindow.loadFile(PACKAGED_HTML_PATH);
  } else {
    mainWindow.loadURL(DEV_SERVER_URL);
  }
}

function startSystemUpdates() {
  snapshotTimer = setInterval(async () => {
    if (
      snapshotInProgress ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.webContents.isDestroyed()
    ) {
      return;
    }

    snapshotInProgress = true;

    try {
      const snapshot = await getSystemSnapshot();

      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send("system:update", snapshot);
      }
    } catch (error) {
      console.error("Unable to collect a SystemPulse snapshot:", error);
    } finally {
      snapshotInProgress = false;
    }
  }, 3000);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  startSystemUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
});
