"use strict";

const si = require("systeminformation");
const { getRunningProcesses } = require("./processService");

/**
 * @typedef {Object} DiskMetric
 * @property {string} filesystem
 * @property {string} mount
 * @property {number} sizeBytes
 * @property {number} usedBytes
 * @property {number} availableBytes
 * @property {number} usagePercent
 */

/**
 * @typedef {Object} SystemSnapshot
 * @property {string} capturedAt ISO-8601 timestamp.
 * @property {{manufacturer: string, brand: string, cores: number, speedGhz: number, loadPercent: number}} cpu
 * @property {{totalBytes: number, usedBytes: number, availableBytes: number, usagePercent: number}} memory
 * @property {DiskMetric} disk The selected primary disk metric.
 * @property {DiskMetric[]} disks All filesystem records returned by systeminformation.
 * @property {import("./processService").RunningProcess[]} processes
 */

/** Convert unknown input into a finite number. */
function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Ensure normal metric values are finite and non-negative. */
function nonNegativeNumber(value) {
  return Math.max(0, finiteNumber(value));
}

/** Return a finite, one-decimal percentage in the range 0–100. */
function percentage(value) {
  return Math.min(100, Math.max(0, Math.round(nonNegativeNumber(value) * 10) / 10));
}

function safeText(value, fallback = "Unknown", maxLength = 160) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  return value.trim().slice(0, maxLength);
}

/**
 * Convert a filesystem record into a stable serializable metric object.
 * A missing or invalid size produces a zero usage percentage.
 *
 * @param {import("systeminformation").Systeminformation.FsSizeData} record
 * @returns {DiskMetric}
 */
function toDiskMetric(record) {
  const sizeBytes = nonNegativeNumber(record.size);
  const usedBytes = nonNegativeNumber(record.used);
  const availableBytes = nonNegativeNumber(record.available);
  const reportedUse = Number(record.use);
  const calculatedUse = sizeBytes > 0 ? (usedBytes / sizeBytes) * 100 : 0;

  return {
    filesystem: safeText(record.fs),
    mount: safeText(record.mount, "Unavailable", 256),
    sizeBytes,
    usedBytes,
    availableBytes,
    usagePercent: percentage(Number.isFinite(reportedUse) ? reportedUse : calculatedUse),
  };
}

/**
 * Select the primary disk metric.
 *
 * On macOS, prefer the filesystem mounted at "/" because it represents the
 * root volume. Some APFS layouts report the writable Data volume separately
 * at "/System/Volumes/Data", so use that as the next choice. If neither mount
 * is reported, select the record with the largest positive capacity; this is
 * a deterministic fallback, not a claim that it is the physical drive.
 *
 * @param {DiskMetric[]} disks
 * @returns {DiskMetric}
 */
function selectPrimaryDisk(disks) {
  const unavailable = {
    filesystem: "Unavailable",
    mount: "Unavailable",
    sizeBytes: 0,
    usedBytes: 0,
    availableBytes: 0,
    usagePercent: 0,
  };

  if (disks.length === 0) return unavailable;

  const rootDisk = disks.find((disk) => disk.mount === "/");
  if (rootDisk) return rootDisk;

  const dataDisk = disks.find((disk) => disk.mount === "/System/Volumes/Data");
  if (dataDisk) return dataDisk;

  return disks.reduce((largest, disk) =>
    disk.sizeBytes > largest.sizeBytes ? disk : largest
  , disks[0]);
}

/**
 * Collect a serializable snapshot of system metrics.
 * All systeminformation queries are independent and run concurrently.
 * Raw process command lines, paths, and parameters are not included.
 *
 * @returns {Promise<SystemSnapshot>}
 */
async function getSystemSnapshot() {
  const [cpu, load, memory, filesystemRecords, processes] = await Promise.all([
    si.cpu(),
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    getRunningProcesses(),
  ]);

  const totalBytes = nonNegativeNumber(memory.total);
  const usedBytes = nonNegativeNumber(memory.used);
  const diskRecords = Array.isArray(filesystemRecords) ? filesystemRecords : [];
  const disks = diskRecords.map(toDiskMetric);

  return {
    capturedAt: new Date().toISOString(),
    cpu: {
      manufacturer: safeText(cpu.manufacturer),
      brand: safeText(cpu.brand),
      cores: Math.max(0, Math.trunc(finiteNumber(cpu.cores))),
      speedGhz: nonNegativeNumber(cpu.speed),
      loadPercent: percentage(load.currentLoad),
    },
    memory: {
      totalBytes,
      usedBytes,
      availableBytes: nonNegativeNumber(memory.available),
      usagePercent: totalBytes > 0 ? percentage((usedBytes / totalBytes) * 100) : 0,
    },
    disk: selectPrimaryDisk(disks),
    disks,
    processes,
  };
}

module.exports = { getSystemSnapshot, selectPrimaryDisk };
