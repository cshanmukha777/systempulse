"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const IPC_CHANNELS = Object.freeze({
  getSnapshot: "system:get-snapshot",
  getMetrics: "system:get-metrics",
  getProcesses: "system:get-processes",
  snapshotUpdate: "system:update",
});

/**
 * @typedef {Object} SystemProcess
 * @property {number} pid
 * @property {string} name
 * @property {number} cpuPercent
 * @property {number} memoryPercent
 */

/**
 * @typedef {Object} SystemMetrics
 * @property {string} sampledAt
 * @property {{loadPercent: number}} cpu
 * @property {{usedBytes: number, totalBytes: number, usagePercent: number, available: boolean}} memory
 * @property {{mount: string, filesystem: string, usedBytes: number, totalBytes: number, usagePercent: number, available: boolean}} disk
 */

/**
 * @template T
 * @typedef {{ok: true, data: T} | {ok: false, error: {code: string, message: string}}} ServiceResponse<T>
 */

/**
 * @typedef {Object} DiskSnapshot
 * @property {string} filesystem
 * @property {string} mount
 * @property {number} sizeBytes
 * @property {number} usedBytes
 * @property {number} availableBytes
 * @property {number} usagePercent
 */

/**
 * @typedef {Object} SystemSnapshot
 * @property {string} capturedAt ISO-8601 timestamp
 * @property {{manufacturer: string, brand: string, cores: number, speedGhz: number, loadPercent: number}} cpu
 * @property {{totalBytes: number, usedBytes: number, availableBytes: number, usagePercent: number}} memory
 * @property {DiskSnapshot[]} disks
 * @property {SystemProcess[]} processes
 */

/**
 * @param {unknown} value
 * @returns {value is SystemSnapshot}
 */
function isSystemSnapshot(value) {
  if (value === null || typeof value !== "object") return false;

  const snapshot = value;
  return (
    typeof snapshot.capturedAt === "string" &&
    snapshot.cpu !== null &&
    typeof snapshot.cpu === "object" &&
    typeof snapshot.cpu.loadPercent === "number" &&
    snapshot.memory !== null &&
    typeof snapshot.memory === "object" &&
    typeof snapshot.memory.usagePercent === "number" &&
    Array.isArray(snapshot.disks) &&
    Array.isArray(snapshot.processes)
  );
}

const systemPulseApi = Object.freeze({
  /**
   * Request one snapshot from the main process.
   * Contract: no arguments; resolves to a SystemSnapshot.
   * @returns {Promise<SystemSnapshot>}
   */
  getSnapshot() {
    return ipcRenderer.invoke(IPC_CHANNELS.getSnapshot);
  },

  /**
   * Request CPU, memory, and primary-disk metrics.
   * Resolves to a serializable success/error envelope.
   * @returns {Promise<ServiceResponse<SystemMetrics>>}
   */
  getMetrics() {
    return ipcRenderer.invoke(IPC_CHANNELS.getMetrics);
  },

  /**
   * Request the top running processes, sorted by CPU usage.
   * Resolves to a serializable success/error envelope.
   * @returns {Promise<ServiceResponse<SystemProcess[]>>}
   */
  getProcesses() {
    return ipcRenderer.invoke(IPC_CHANNELS.getProcesses);
  },

  /**
   * Subscribe to periodic system snapshots.
   * Contract: callback receives a SystemSnapshot; returns an unsubscribe function.
   * The IPC event object and channel names are never exposed to the renderer.
   * @param {(snapshot: SystemSnapshot) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onSnapshot(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("systemPulse.onSnapshot requires a callback function");
    }

    const listener = (_event, payload) => {
      if (isSystemSnapshot(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.snapshotUpdate, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.snapshotUpdate, listener);
    };
  },
});

contextBridge.exposeInMainWorld("systemPulse", systemPulseApi);
