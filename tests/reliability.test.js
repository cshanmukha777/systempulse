"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const si = require("systeminformation");
const { formatPercent, formatBytes, clampPercent } = require("../src/utils/formatters");
const { shouldNotifyCpuThreshold } = require("../src/utils/notificationThreshold");
const { toDiskMetric, selectPrimaryDisk, getSystemSnapshot } = require("../electron/systemService");
const { getRunningProcesses, DEFAULT_PROCESS_LIMIT } = require("../electron/processService");

const original = {};
for (const key of ["cpu", "currentLoad", "mem", "fsSize", "processes"]) original[key] = si[key];
function restoreSystemInformation() {
  for (const [key, value] of Object.entries(original)) si[key] = value;
}

test.afterEach(restoreSystemInformation);

test("percentage formatting clamps finite values and safely handles invalid numbers", () => {
  assert.equal(formatPercent(45.67), "45.7%");
  assert.equal(formatPercent(-3), "0.0%");
  assert.equal(formatPercent(120), "100.0%");
  assert.equal(formatPercent(Number.NaN), "0.0%");
  assert.equal(formatPercent(Number.POSITIVE_INFINITY), "0.0%");
  assert.equal(clampPercent(32), 32);
});

test("byte formatting uses binary units and rejects invalid readings", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(900), "900 B");
  assert.equal(formatBytes(1024), "1.0 KiB");
  assert.equal(formatBytes(1024 ** 2), "1.0 MiB");
  assert.equal(formatBytes(1024 ** 3), "1.0 GiB");
  assert.equal(formatBytes(-1), "Unavailable");
  assert.equal(formatBytes(Number.NaN), "Unavailable");
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), "Unavailable");
});

test("notification threshold only triggers on a valid crossing while enabled", () => {
  assert.equal(shouldNotifyCpuThreshold(false, 80, 80, true), true);
  assert.equal(shouldNotifyCpuThreshold(true, 95, 80, true), false);
  assert.equal(shouldNotifyCpuThreshold(false, 79.9, 80, true), false);
  assert.equal(shouldNotifyCpuThreshold(false, 90, 80, false), false);
  assert.equal(shouldNotifyCpuThreshold(false, 90, 80, true, false), false);
  assert.equal(shouldNotifyCpuThreshold(false, Number.NaN, 80, true), false);
  assert.equal(shouldNotifyCpuThreshold(false, 90, 101, true), false);
});

test("disk calculation clamps used bytes and calculates percentages", () => {
  const metric = toDiskMetric({ fs: "APFS", mount: "/", size: 1000, used: 250, available: 750 });
  assert.equal(metric.usagePercent, 25);
  assert.equal(metric.available, true);
  assert.equal(metric.usedBytes, 250);
  const overused = toDiskMetric({ fs: "APFS", mount: "/", size: 100, used: 200, available: -1 });
  assert.equal(overused.usedBytes, 100);
  assert.equal(overused.usagePercent, 100);
  assert.equal(toDiskMetric({ fs: "?", mount: "/", size: 0, used: 0 }).available, false);
});

test("primary disk selection prefers macOS Data, then root, then largest usable volume", () => {
  const disks = [
    toDiskMetric({ fs: "small", mount: "/other", size: 100, used: 50 }),
    toDiskMetric({ fs: "root", mount: "/", size: 500, used: 200 }),
    toDiskMetric({ fs: "data", mount: "/System/Volumes/Data", size: 300, used: 100 }),
  ];
  assert.equal(selectPrimaryDisk(disks, "darwin").mount, "/System/Volumes/Data");
  assert.equal(selectPrimaryDisk(disks, "linux").mount, "/");
  assert.equal(selectPrimaryDisk(disks.slice(0, 1), "win32").mount, "/other");
  assert.equal(selectPrimaryDisk([], "darwin").available, false);
});

test("system metrics normalize mocked readings without touching live hardware", async () => {
  si.cpu = async () => ({ manufacturer: "Test", brand: "Mock CPU", cores: 8, speed: 2.5 });
  si.currentLoad = async () => ({ currentLoad: 37.25 });
  si.mem = async () => ({ total: 1000, used: 400, available: 600 });
  si.fsSize = async () => [{ fs: "mockfs", mount: "/", size: 2000, used: 1000, available: 1000 }];
  si.processes = async () => ({ list: [{ pid: 1, name: "mock-process", cpu: 15, mem: 4 }] });

  const snapshot = await getSystemSnapshot();
  assert.equal(snapshot.cpu.loadPercent, 37.3);
  assert.equal(snapshot.cpu.available, true);
  assert.equal(snapshot.memory.usagePercent, 40);
  assert.equal(snapshot.disk.usagePercent, 50);
  assert.deepEqual(snapshot.processes, [{ pid: 1, name: "mock-process", cpuPercent: 15, memoryPercent: 4 }]);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("invalid and rejected system readings are marked unavailable and stay finite", async () => {
  si.cpu = async () => ({});
  si.currentLoad = async () => ({ currentLoad: Number.NaN });
  si.mem = async () => ({ total: 0, used: Number.POSITIVE_INFINITY, available: Number.NaN });
  si.fsSize = async () => [{ fs: "bad", mount: "/", size: 0, used: Number.NaN }];
  si.processes = async () => { throw new Error("mock hardware failure"); };

  const snapshot = await getSystemSnapshot();
  assert.equal(snapshot.cpu.available, false);
  assert.equal(snapshot.memory.available, false);
  assert.equal(snapshot.disk.available, false);
  assert.deepEqual(snapshot.processes, []);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  for (const value of [snapshot.cpu.loadPercent, snapshot.memory.usagePercent, snapshot.disk.usagePercent]) assert.ok(Number.isFinite(value));
});

test("process service filters invalid PIDs, normalizes readings, sorts and limits results", async () => {
  si.processes = async () => ({
    list: [
      { pid: 3, name: "low", cpu: 2, mem: 3 },
      { pid: 2, name: "high", cpu: 70, mem: 5 },
      { pid: -1, name: "invalid pid", cpu: 99, mem: 2 },
      { pid: 4, name: "", cpu: 140, mem: -3 },
      ...Array.from({ length: DEFAULT_PROCESS_LIMIT + 5 }, (_, index) => ({ pid: index + 10, name: "extra-" + index, cpu: index, mem: 1 })),
    ],
  });
  const processes = await getRunningProcesses();
  assert.equal(processes.length, DEFAULT_PROCESS_LIMIT);
  assert.equal(processes[0].pid, 4); // 140% is clamped to 100% before sorting.
  assert.equal(processes[1].name, "high");
  assert.equal(processes.some((process) => process.pid === -1), false);
  assert.equal(processes.find((process) => process.pid === 4).name, "Unknown process");
  assert.equal(processes.find((process) => process.pid === 4).cpuPercent, 100);
  assert.equal(processes.find((process) => process.pid === 4).memoryPercent, 0);
  assert.ok(processes.every((process) => Number.isFinite(process.cpuPercent) && process.cpuPercent >= 0 && process.cpuPercent <= 100));
});

test("IPC handlers register expected channels and reject untrusted senders", async () => {
  const { registerIpcHandlers } = require("../electron/ipcHandlers");
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { assert.equal(handlers.has(channel), false); handlers.set(channel, handler); } };
  registerIpcHandlers(ipcMain, () => false);
  assert.deepEqual([...handlers.keys()].sort(), ["system:get-metrics", "system:get-processes"]);
  const response = await handlers.get("system:get-metrics")({});
  assert.deepEqual(response, { ok: false, error: { code: "UNTRUSTED_SENDER", message: "This request is not permitted." } });
});

test("IPC service exceptions become safe serializable error envelopes", async () => {
  const servicePath = require.resolve("../electron/systemService");
  const ipcPath = require.resolve("../electron/ipcHandlers");
  const service = require(servicePath);
  const originalSnapshot = service.getSystemSnapshot;
  service.getSystemSnapshot = async () => { throw new Error("/private/path secret stack"); };
  delete require.cache[ipcPath];
  try {
    const { registerIpcHandlers } = require(ipcPath);
    const handlers = new Map();
    registerIpcHandlers({ handle(channel, handler) { handlers.set(channel, handler); } }, () => true);
    const response = await handlers.get("system:get-metrics")({});
    assert.deepEqual(response, { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "System data is temporarily unavailable." } });
    assert.doesNotThrow(() => JSON.stringify(response));
    assert.equal(JSON.stringify(response).includes("/private/path"), false);
  } finally {
    service.getSystemSnapshot = originalSnapshot;
    delete require.cache[ipcPath];
  }
});
