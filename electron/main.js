"use strict";

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { getSystemSnapshot } = require("./systemService");
const { registerIpcHandlers: registerSystemRequestHandlers } = require("./ipcHandlers");

const DEV_SERVER_URL = "http://localhost:5173";
const PACKAGED_HTML_PATH = path.join(__dirname, "../dist/index.html");
const PACKAGED_HTML_URL = pathToFileURL(PACKAGED_HTML_PATH).href;
const WINDOW_STATE_PATH = path.join(app.getPath("userData"), "window-state.json");
const SNAPSHOT_INTERVAL_MS = 3000;

let mainWindow = null;
let tray = null;
let snapshotTimer = null;
let snapshotInProgress = false;
let isQuitting = false;
let handlersRegistered = false;
let lastWindowBounds = { width: 1280, height: 800 };

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(WINDOW_STATE_PATH, "utf8"));
    if (state && Number.isFinite(state.width) && Number.isFinite(state.height)) {
      lastWindowBounds = {
        width: Math.max(900, Math.min(2400, Math.round(state.width))),
        height: Math.max(600, Math.min(1600, Math.round(state.height))),
        ...(Number.isFinite(state.x) ? { x: Math.round(state.x) } : {}),
        ...(Number.isFinite(state.y) ? { y: Math.round(state.y) } : {}),
      };
    }
  } catch { /* First launch or invalid state: use sensible defaults. */ }
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
  const bounds = mainWindow.getBounds();
  try {
    fs.mkdirSync(path.dirname(WINDOW_STATE_PATH), { recursive: true });
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(bounds), { mode: 0o600 });
    lastWindowBounds = bounds;
  } catch (error) {
    console.warn("Unable to persist window bounds:", error && error.message ? error.message : error);
  }
}

function isTrustedUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  if (app.isPackaged) return rawUrl.split(/[?#]/, 1)[0] === PACKAGED_HTML_URL;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && url.hostname === "localhost" && url.port === "5173";
  } catch { return false; }
}

function isTrustedIpcSender(event) {
  return Boolean(event.senderFrame && event.senderFrame === event.sender.mainFrame && isTrustedUrl(event.senderFrame.url));
}

function registerIpcHandlers() {
  if (handlersRegistered) return;
  ipcMain.handle("system:get-snapshot", async (event) => {
    if (!isTrustedIpcSender(event)) throw new Error("Rejected IPC request from an untrusted frame");
    return getSystemSnapshot();
  });
  registerSystemRequestHandlers(ipcMain, isTrustedIpcSender);
  handlersRegistered = true;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;
  // A compact monochrome SVG avoids adding a binary asset or dependency.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#79e0bd"/><path d="M7 17h4l3-7 4 13 3-7h4" fill="none" stroke="#10201d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icon = nativeImage.createFromDataURL("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  tray = new Tray(icon);
  tray.setToolTip("SystemPulse — Smart Desktop System Monitor");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open SystemPulse", click: showWindow },
    { type: "separator" },
    { label: "Quit SystemPulse", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("double-click", showWindow);
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow();
    return mainWindow;
  }
  readWindowState();
  mainWindow = new BrowserWindow({
    ...lastWindowBounds,
    minWidth: 900,
    minHeight: 600,
    title: "SystemPulse — Smart Desktop System Monitor",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.on("resize", persistWindowState);
  mainWindow.on("move", persistWindowState);
  mainWindow.on("close", (event) => {
    persistWindowState();
    if (!isQuitting && tray && !tray.isDestroyed()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  if (app.isPackaged) void mainWindow.loadFile(PACKAGED_HTML_PATH);
  else void mainWindow.loadURL(DEV_SERVER_URL);
  return mainWindow;
}

async function collectAndPublishSnapshot() {
  if (snapshotInProgress || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  snapshotInProgress = true;
  const targetWindow = mainWindow;
  try {
    const snapshot = await getSystemSnapshot();
    if (targetWindow === mainWindow && !targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
      targetWindow.webContents.send("system:update", snapshot);
    }
  } catch (error) {
    console.error("Unable to collect a SystemPulse snapshot:", error);
  } finally {
    snapshotInProgress = false;
  }
}

function scheduleSystemUpdates() {
  if (snapshotTimer || isQuitting) return;
  snapshotTimer = setTimeout(async function tick() {
    snapshotTimer = null;
    if (isQuitting) return;
    await collectAndPublishSnapshot();
    if (!isQuitting) scheduleSystemUpdates();
  }, SNAPSHOT_INTERVAL_MS);
}

function stopSystemUpdates() {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = null;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createTray();
  createWindow();
  scheduleSystemUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 || !mainWindow || mainWindow.isDestroyed()) createWindow();
    else showWindow();
  });
});

app.on("window-all-closed", () => {
  // Keep the tray resident until the user chooses Quit from its menu.
});

app.on("before-quit", () => {
  isQuitting = true;
  stopSystemUpdates();
  persistWindowState();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  for (const channel of ["system:get-snapshot", "system:get-metrics", "system:get-processes"]) {
    try { ipcMain.removeHandler(channel); } catch { /* Handler may not have been registered. */ }
  }
  handlersRegistered = false;
});

app.on("will-quit", () => {
  stopSystemUpdates();
});
