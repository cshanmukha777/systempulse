import * as si from "systeminformation";

export interface CpuMetrics {
  loadPercent: number;
  available: boolean;
}

export interface MemoryMetrics {
  usedBytes: number;
  totalBytes: number;
  usagePercent: number;
  available: boolean;
}

export interface DiskMetrics {
  mount: string;
  filesystem: string;
  usedBytes: number;
  totalBytes: number;
  usagePercent: number;
  available: boolean;
}

export interface SystemMetrics {
  sampledAt: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
}

type FileSystemRecord = Awaited<ReturnType<typeof si.fsSize>>[number];

interface NormalizedDisk {
  mount: string;
  filesystem: string;
  usedBytes: number;
  totalBytes: number;
  hasCapacity: boolean;
  hasUsage: boolean;
}

const UNAVAILABLE = "Unavailable";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeFinite(value: unknown): number {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function safePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function percentageOf(used: number, total: number): number {
  if (total <= 0) return 0;
  return safePercent((used / total) * 100);
}

function safeLabel(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 256)
    : UNAVAILABLE;
}

async function safely<T>(query: () => Promise<T>): Promise<T | null> {
  try {
    return await query();
  } catch {
    // A failed probe should not prevent other independently collected metrics.
    return null;
  }
}

function normalizeDisk(record: FileSystemRecord): NormalizedDisk {
  const hasCapacity = isFiniteNumber(record.size) && record.size > 0;
  const hasUsage = isFiniteNumber(record.used) && record.used >= 0;

  return {
    mount: safeLabel(record.mount),
    filesystem: safeLabel(record.fs),
    usedBytes: nonNegativeFinite(record.used),
    totalBytes: nonNegativeFinite(record.size),
    hasCapacity,
    hasUsage: hasCapacity && hasUsage,
  };
}

/**
 * Pick one filesystem to represent primary disk usage.
 *
 * On macOS, prefer /System/Volumes/Data, the writable APFS data volume
 * typically holding user data. Fall back to / if that mount is not reported,
 * and then to the filesystem with the largest positive capacity. This reports
 * one filesystem's capacity; it does not claim to measure the whole physical
 * APFS container when multiple volumes share that container.
 *
 * On other platforms, prefer / when it has a usable capacity; otherwise use
 * the filesystem with the largest positive capacity. If all capacities are
 * unavailable/zero, retain the first record for its labels but mark it unavailable.
 */
function selectPrimaryDisk(
  disks: readonly NormalizedDisk[],
  platform: NodeJS.Platform = process.platform,
): NormalizedDisk | null {
  if (disks.length === 0) return null;

  const usable = disks.filter((disk) => disk.hasCapacity);
  const largest = usable.reduce<NormalizedDisk | null>(
    (current, disk) => current === null || disk.totalBytes > current.totalBytes ? disk : current,
    null,
  );

  if (platform === "darwin") {
    const dataVolume = usable.find((disk) => disk.mount === "/System/Volumes/Data");
    if (dataVolume) return dataVolume;

    const rootVolume = usable.find((disk) => disk.mount === "/");
    if (rootVolume) return rootVolume;

    return largest ?? disks[0];
  }

  const rootVolume = usable.find((disk) => disk.mount === "/");
  return rootVolume ?? largest ?? disks[0];
}

function emptyDisk(): DiskMetrics {
  return {
    mount: UNAVAILABLE,
    filesystem: UNAVAILABLE,
    usedBytes: 0,
    totalBytes: 0,
    usagePercent: 0,
    available: false,
  };
}

/**
 * Retrieve CPU load, memory utilization, and primary disk utilization.
 * Queries are independent and run concurrently. Every numeric output is finite,
 * and every metric object is serializable with explicit availability metadata.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [load, memory, fileSystemRecords] = await Promise.all([
    safely(() => si.currentLoad()),
    safely(() => si.mem()),
    safely(() => si.fsSize()),
  ]);

  const cpuAvailable = load !== null && isFiniteNumber(load.currentLoad);
  const totalMemory = nonNegativeFinite(memory?.total);
  const usedMemory = nonNegativeFinite(memory?.used);
  const memoryAvailable =
    memory !== null &&
    isFiniteNumber(memory.total) &&
    memory.total > 0 &&
    isFiniteNumber(memory.used);

  const records: FileSystemRecord[] = Array.isArray(fileSystemRecords)
    ? fileSystemRecords.filter((record) => record !== null && typeof record === "object")
    : [];
  const disks = records.map(normalizeDisk);
  const primaryDisk = selectPrimaryDisk(disks);

  const disk: DiskMetrics = primaryDisk
    ? {
        mount: primaryDisk.mount,
        filesystem: primaryDisk.filesystem,
        usedBytes: primaryDisk.usedBytes,
        totalBytes: primaryDisk.totalBytes,
        usagePercent: primaryDisk.hasUsage
          ? percentageOf(primaryDisk.usedBytes, primaryDisk.totalBytes)
          : 0,
        available: primaryDisk.hasUsage,
      }
    : emptyDisk();

  return {
    sampledAt: new Date().toISOString(),
    cpu: {
      loadPercent: cpuAvailable ? safePercent(load.currentLoad) : 0,
      available: cpuAvailable,
    },
    memory: {
      usedBytes: usedMemory,
      totalBytes: totalMemory,
      usagePercent: memoryAvailable ? percentageOf(usedMemory, totalMemory) : 0,
      available: memoryAvailable,
    },
    disk,
  };
}
