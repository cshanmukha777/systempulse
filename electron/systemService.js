"use strict";

const si = require("systeminformation");

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value) {
  return Math.max(0, finiteNumber(value));
}

function percentage(value) {
  return Math.round(nonNegativeNumber(value) * 10) / 10;
}

function safeText(value, fallback = "Unknown", maxLength = 160) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}

/**
 * Collects a renderer-safe system snapshot.
 *
 * Only this main-process service imports systeminformation. Raw process
 * command lines, paths, parameters, and other unnecessary details are never
 * forwarded to the renderer.
 *
 * @returns {Promise<{
 *   capturedAt: string,
 *   cpu: { manufacturer: string, brand: string, cores: number, speedGhz: number, loadPercent: number },
 *   memory: { totalBytes: number, usedBytes: number, availableBytes: number, usagePercent: number },
 *   disks: Array<{ filesystem: string, mount: string, sizeBytes: number, usedBytes: number, availableBytes: number, usagePercent: number }>,
 *   processes: Array<{ pid: number, name: string, state: string, cpuPercent: number, memoryPercent: number }>
 * }>}
 */
async function getSystemSnapshot() {
  const [cpu, load, memory, filesystems, processData] = await Promise.all([
    si.cpu(),
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.processes(),
  ]);

  const totalBytes = nonNegativeNumber(memory.total);
  const usedBytes = nonNegativeNumber(memory.used);
  const processList = Array.isArray(processData.list) ? processData.list : [];
  const diskList = Array.isArray(filesystems) ? filesystems : [];

  const processes = processList
    .map((process) => ({
      pid: finiteNumber(process.pid, -1),
      name: safeText(process.name),
      state: safeText(process.state, "unknown", 48),
      cpuPercent: percentage(process.cpu),
      memoryPercent: percentage(process.mem),
    }))
    .filter((process) => process.pid >= 0)
    .sort((a, b) => b.cpuPercent - a.cpuPercent);

  const disks = diskList.map((disk) => ({
    filesystem: safeText(disk.fs),
    mount: safeText(disk.mount, "Unknown", 256),
    sizeBytes: nonNegativeNumber(disk.size),
    usedBytes: nonNegativeNumber(disk.used),
    availableBytes: nonNegativeNumber(disk.available),
    usagePercent: percentage(disk.use),
  }));

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
    disks,
    processes,
  };
}

module.exports = { getSystemSnapshot };
