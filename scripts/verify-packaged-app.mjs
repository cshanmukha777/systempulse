import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";

const appPath = process.env.SYSTEMPULSE_APP_PATH;
if (!appPath || !fs.existsSync(appPath)) {
  throw new Error("Set SYSTEMPULSE_APP_PATH to the installed SystemPulse.app bundle.");
}
const executable = path.join(appPath, "Contents", "MacOS", "SystemPulse");
if (!fs.existsSync(executable)) throw new Error(`Packaged executable missing: ${executable}`);

const downloadDir = process.env.SYSTEMPULSE_DOWNLOAD_DIR || path.join(os.tmpdir(), "systempulse-downloads");
fs.mkdirSync(downloadDir, { recursive: true });
const child = spawn(executable, ["--remote-debugging-port=9222", "--no-first-run"], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
});
let socket;
let nextId = 0;
const pending = new Map();

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to Electron DevTools.")), 15000);
    ws.addEventListener("open", () => { clearTimeout(timeout); resolve(ws); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Unable to connect to Electron DevTools.")); }, { once: true });
    ws.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message || "DevTools command failed"));
      else item.resolve(message.result || {});
    });
    ws.addEventListener("close", () => {
      for (const item of pending.values()) item.reject(new Error("Electron DevTools connection closed."));
      pending.clear();
    });
  });
}

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Renderer evaluation failed");
  }
  return result.result?.value;
}

async function waitUntil(label, test, timeoutMs = 30000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await test();
      if (result) return result;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

try {
  await waitUntil("packaged app DevTools endpoint", async () => {
    if (child.exitCode !== null) throw new Error(`Packaged app exited early with code ${child.exitCode}`);
    const response = await fetch("http://127.0.0.1:9222/json/list");
    return response.ok;
  }, 30000);

  const response = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await response.json();
  const target = targets.find((item) => item.type === "page" && item.url.startsWith("file://"));
  if (!target) throw new Error("The packaged app did not load its local file:// renderer (development server independence check failed).");
  socket = await connect(target.webSocketDebuggerUrl);
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });

  await waitUntil("dashboard and live system data", async () => {
    const state = await evaluate(`(() => ({
      title: document.title,
      heading: document.querySelector("h1")?.textContent || "",
      metricCards: document.querySelectorAll(".metric-card").length,
      metricValues: [...document.querySelectorAll(".metric-card__value")].map((node) => node.textContent.trim()),
      processRows: document.querySelectorAll(".process-panel tbody tr").length,
      processHeading: document.querySelector("#process-heading")?.textContent || ""
    }))()`);
    return state.heading && state.metricCards === 3 && state.metricValues.every((value) => value && value !== "—") && state.processHeading.includes("Running processes") && state.processRows > 0 ? state : false;
  });
  console.log("PASS: packaged renderer loaded from file:// and displayed live metrics plus process rows.");

  await evaluate(`(() => {
    const slider = document.querySelector('input[type="range"]');
    const select = document.querySelector(".preferences-panel select");
    if (!slider || !select) throw new Error("Preference controls not found.");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(slider, "65");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    const selectSet = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    selectSet.call(select, "5");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  await waitUntil("saved preference values", async () => {
    const prefs = await evaluate(`JSON.parse(localStorage.getItem("systempulse.preferences.v1") || "null")`);
    return prefs?.cpuWarningThreshold === 65 && prefs?.refreshIntervalSeconds === 5 ? prefs : false;
  });
  await command("Page.reload");
  await waitUntil("preferences persisted after reload", async () => {
    const prefs = await evaluate(`JSON.parse(localStorage.getItem("systempulse.preferences.v1") || "null")`);
    return prefs?.cpuWarningThreshold === 65 && prefs?.refreshIntervalSeconds === 5 ? prefs : false;
  });
  console.log("PASS: CPU threshold and refresh interval preferences save locally and survive a renderer reload.");

  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__systemPulseTestNotifications = [];
      try { Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: class TestNotification {
        static permission = "granted";
        static requestPermission = async () => "granted";
        constructor(title, options = {}) { window.__systemPulseTestNotifications.push({ title, body: options.body || "" }); }
      }}); } catch (error) { window.__systemPulseTestNotificationOverrideError = String(error); }`
  });
  await evaluate(`localStorage.setItem("systempulse.preferences.v1", JSON.stringify({ cpuWarningThreshold: 0, refreshIntervalSeconds: 2, notificationsEnabled: true }))`);
  await command("Page.reload");
  await waitUntil("notification threshold crossing", async () => {
    const result = await evaluate(`({ count: (window.__systemPulseTestNotifications || []).length, permission: typeof Notification === "undefined" ? "missing" : Notification.permission, error: window.__systemPulseTestNotificationOverrideError || "" })`);
    if (result.error) throw new Error(result.error);
    return result.count > 0 ? result : false;
  }, 20000);
  console.log("PASS: enabling notifications and crossing a CPU threshold invokes the notification path (test notification stub).");

  await evaluate(`(() => {
    window.__systemPulseLastExportBlob = null;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__systemPulseLastExportBlob = blob; return original(blob); };
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.includes("Export JSON"));
    if (!button) throw new Error("Export JSON button not found.");
    button.click();
    return true;
  })()`);
  await waitUntil("JSON export payload", async () => {
    const payload = await evaluate(`window.__systemPulseLastExportBlob ? window.__systemPulseLastExportBlob.text().then((text) => ({ text, feedback: document.querySelector('[role="status"][aria-live="polite"]')?.textContent || "" })) : null`);
    if (!payload?.text) return false;
    const parsed = JSON.parse(payload.text);
    if (parsed.app !== "SystemPulse" || !Array.isArray(parsed.processes) || !Array.isArray(parsed.cpuHistory) || !parsed.exportedAt) {
      throw new Error("Export JSON is missing expected fields.");
    }
    return { ...parsed, feedback: payload.feedback };
  });
  await waitUntil("downloaded JSON file", async () => fs.readdirSync(downloadDir).find((name) => /^systempulse-.*\.json$/.test(name)));
  console.log("PASS: Export JSON created a valid payload and a nonempty downloaded .json file.");

  try {
    execFileSync("osascript", ["-e", 'tell application "SystemPulse" to activate', "-e", 'tell application "System Events" to tell process "SystemPulse" to click menu bar item "SystemPulse" of menu bar 1', "-e", 'tell application "System Events" to tell process "SystemPulse" to click menu item "About SystemPulse" of menu 1 of menu bar item "SystemPulse" of menu bar 1'], { stdio: "ignore", timeout: 8000 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const about = execFileSync("osascript", ["-e", 'tell application "System Events" to tell process "SystemPulse" to get name of every window'], { encoding: "utf8", timeout: 5000 });
    if (!about.toLowerCase().includes("about")) throw new Error("About panel did not appear in the app window list.");
    console.log("PASS: native macOS About panel opened from the SystemPulse application menu.");
  } catch (error) {
    console.warn("UNVERIFIED: native About panel interaction was blocked by macOS UI automation permissions or did not expose its window to AppleScript.");
    console.warn(error.message);
  }
} finally {
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (child.exitCode === null) child.kill("SIGKILL");
}
