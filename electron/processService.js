"use strict";

const si = require("systeminformation");

const DEFAULT_PROCESS_LIMIT = 20;

/**
 * Plain, serializable process metrics exposed by the main process.
 *
 * @typedef {Object} RunningProcess
 * @property {number} pid Process identifier.
 * @property {string} name Process name, or a safe fallback when unavailable.
 * @property {number} cpuPercent CPU usage percentage, normalized to 0–100.
 * @property {number} memoryPercent Memory usage percentage, normalized to 0–100.
 */

/**
 * Convert a reading to a finite non-negative number.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function finiteNumber(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

/**
 * Normalize a metric percentage to a finite value between 0 and 100.
 *
 * @param {unknown} value
 * @returns {number}
 */
function safePercent(value) {
  return Math.min(100, Math.round(finiteNumber(value) * 10) / 10);
}

/**
 * Return a bounded process name without exposing command lines or paths.
 *
 * @param {unknown} value
 * @returns {string}
 */
function safeProcessName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "Unknown process";
  }

  return value.trim().slice(0, 160);
}

/**
 * Read running-process metrics from systeminformation.
 *
 * systeminformation v5.33.16 declares the process array as
 * Systeminformation.ProcessesProcessData[]; its relevant fields are pid,
 * name, cpu, and mem. The returned objects deliberately contain only the
 * four public fields needed by SystemPulse, not the library records.
 *
 * This function is read-only: it does not terminate, modify, or control
 * any process.
 *
 * @returns {Promise<RunningProcess[]>}
 */
async function getRunningProcesses() {
  const result = await si.processes();
  const records = Array.isArray(result.list) ? result.list : [];

  return records
    .filter((process) => process != null)
    .map((process) => ({
      pid: finiteNumber(process.pid, -1),
      name: safeProcessName(process.name),
      cpuPercent: safePercent(process.cpu),
      memoryPercent: safePercent(process.mem),
    }))
    .filter((process) => Number.isSafeInteger(process.pid) && process.pid >= 0)
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    .slice(0, DEFAULT_PROCESS_LIMIT);
}

module.exports = { getRunningProcesses, DEFAULT_PROCESS_LIMIT };
