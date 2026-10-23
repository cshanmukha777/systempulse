"use strict";

const { getSystemSnapshot } = require("./systemService");
const { getRunningProcesses } = require("./processService");

const ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "SERVICE_UNAVAILABLE",
    message: "System data is temporarily unavailable.",
  }),
});

/**
 * Register the app's request/response IPC channels once during app startup.
 * Only trusted main-frame requests are accepted. Service exceptions are
 * converted into a fixed serializable error response; raw errors are not sent
 * to the renderer.
 *
 * @param {import("electron").IpcMain} ipcMain
 * @param {(event: import("electron").IpcMainInvokeEvent) => boolean} isTrustedIpcSender
 */
function registerIpcHandlers(ipcMain, isTrustedIpcSender) {
  /**
   * @param {string} channel
   * @param {() => Promise<any>} service
   * @param {(value: any) => unknown} [mapResult]
   */
  const register = (channel, service, mapResult = (value) => value) => {
    ipcMain.handle(channel, async (event) => {
      if (!isTrustedIpcSender(event)) {
        return {
          ok: false,
          error: {
            code: "UNTRUSTED_SENDER",
            message: "This request is not permitted.",
          },
        };
      }

      try {
        const result = await service();
        return { ok: true, data: mapResult(result) };
      } catch {
        // Do not forward stack traces, exception messages, or filesystem paths.
        return {
          ok: false,
          error: {
            code: ERROR_RESPONSE.error.code,
            message: ERROR_RESPONSE.error.message,
          },
        };
      }
    });
  };

  register("system:get-metrics", getSystemSnapshot, (snapshot) => ({
    sampledAt: snapshot.capturedAt,
    cpu: { loadPercent: snapshot.cpu.loadPercent },
    memory: {
      usedBytes: snapshot.memory.usedBytes,
      totalBytes: snapshot.memory.totalBytes,
      usagePercent: snapshot.memory.usagePercent,
      available: snapshot.memory.totalBytes > 0,
    },
    disk: {
      mount: snapshot.disk.mount,
      filesystem: snapshot.disk.filesystem,
      usedBytes: snapshot.disk.usedBytes,
      totalBytes: snapshot.disk.sizeBytes,
      usagePercent: snapshot.disk.usagePercent,
      available: snapshot.disk.sizeBytes > 0,
    },
  }));

  register("system:get-processes", getRunningProcesses);
}

module.exports = { registerIpcHandlers };
