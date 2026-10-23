"use strict";

const si = require("systeminformation");
const { getRunningProcesses } = require("./processService");

function finiteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function nonNegative(value) { return Math.max(0, finiteNumber(value)); }
function percentage(value) {
  return Math.round(Math.min(100, Math.max(0, finiteNumber(value))) * 10) / 10;
}
function safeText(value, fallback = "Unavailable", maxLength = 160) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}
async function safely(query, fallback) {
  try { return await query(); } catch { return fallback; }
}
function toDiskMetric(record) {
  const sizeBytes = nonNegative(record.size);
  const hasUsed = typeof record.used === "number" && Number.isFinite(record.used) && record.used >= 0;
  const usedBytes = hasUsed ? Math.min(sizeBytes || nonNegative(record.used), record.used) : 0;
  const availableBytes = nonNegative(record.available);
  const available = sizeBytes > 0 && hasUsed;
  return {
    filesystem: safeText(record.fs),
    mount: safeText(record.mount, "Unavailable", 256),
    sizeBytes,
    usedBytes,
    availableBytes,
    usagePercent: available ? percentage((usedBytes / sizeBytes) * 100) : 0,
    available,
  };
}

/**
 * Pick a single filesystem for the dashboard. On macOS prefer the writable
 * APFS Data volume when it has valid capacity, then a usable root volume.
 * Other systems prefer a usable root mount. If neither is available, choose
 * the largest filesystem with positive capacity; otherwise return an
 * unavailable metric. APFS volumes can share a physical container, so this
 * is a filesystem-level figure, not a physical-drive total.
 */
function selectPrimaryDisk(disks, platform = process.platform) {
  const unavailable = {
    filesystem: "Unavailable", mount: "Unavailable", sizeBytes: 0,
    usedBytes: 0, availableBytes: 0, usagePercent: 0, available: false,
  };
  if (!Array.isArray(disks) || disks.length === 0) return unavailable;
  const usable = disks.filter((disk) => disk && disk.available && disk.sizeBytes > 0);
  if (platform === "darwin") {
    const data = usable.find((disk) => disk.mount === "/System/Volumes/Data");
    if (data) return data;
  }
  const root = usable.find((disk) => disk.mount === "/");
  if (root) return root;
  if (usable.length) return usable.reduce((largest, disk) => disk.sizeBytes > largest.sizeBytes ? disk : largest);
  return { ...disks[0], available: false, usagePercent: 0, usedBytes: nonNegative(disks[0].usedBytes), sizeBytes: nonNegative(disks[0].sizeBytes) };
}

async function getSystemSnapshot() {
  const [cpuInfo, load, memory, filesystemRecords, processes] = await Promise.all([
    safely(() => si.cpu(), {}),
    safely(() => si.currentLoad(), null),
    safely(() => si.mem(), null),
    safely(() => si.fsSize(), []),
    safely(() => getRunningProcesses(), []),
  ]);
  const totalBytes = nonNegative(memory && memory.total);
  const rawUsedMemory = memory && typeof memory.used === "number" && Number.isFinite(memory.used) && memory.used >= 0 ? memory.used : null;
  const memoryAvailable = totalBytes > 0 && rawUsedMemory !== null;
  const usedBytes = memoryAvailable ? Math.min(totalBytes, rawUsedMemory) : 0;
  const cpuAvailable = Boolean(load && typeof load.currentLoad === "number" && Number.isFinite(load.currentLoad) && load.currentLoad >= 0 && load.currentLoad <= 100);
  const rawDisks = Array.isArray(filesystemRecords) ? filesystemRecords.filter((record) => record && typeof record === "object") : [];
  const disks = rawDisks.map(toDiskMetric);
  const disk = selectPrimaryDisk(disks);

  return {
    capturedAt: new Date().toISOString(),
    cpu: {
      manufacturer: safeText(cpuInfo.manufacturer),
      brand: safeText(cpuInfo.brand),
      cores: Math.max(0, Math.trunc(finiteNumber(cpuInfo.cores))),
      speedGhz: nonNegative(cpuInfo.speed),
      loadPercent: cpuAvailable ? percentage(load.currentLoad) : 0,
      available: cpuAvailable,
    },
    memory: {
      totalBytes,
      usedBytes,
      availableBytes: nonNegative(memory && memory.available),
      usagePercent: memoryAvailable ? percentage((usedBytes / totalBytes) * 100) : 0,
      available: memoryAvailable,
    },
    disk,
    disks,
    processes: Array.isArray(processes) ? processes : [],
  };
}

module.exports = { getSystemSnapshot, selectPrimaryDisk, toDiskMetric };
