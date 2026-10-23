import * as si from "systeminformation";

/**
 * Safe, renderer-agnostic process metrics.
 * Deliberately excludes command lines, paths, parameters, user names, and other
 * systeminformation fields that are not needed for a monitoring table.
 */
export interface RunningProcessMetric {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryPercent: number;
}

type SystemInformationProcess = Awaited<ReturnType<typeof si.processes>>["list"][number];

const MAX_RETURNED_PROCESSES = 20;
const UNKNOWN_PROCESS_NAME = "Unknown process";

/**
 * Convert a possibly invalid percentage into a finite value from 0 to 100.
 * The systeminformation type declares numeric fields, but values can be
 * unavailable at runtime; invalid readings are normalized to zero.
 */
function safePercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  const clamped = Math.min(100, Math.max(0, value));
  return Math.round(clamped * 10) / 10;
}

function normalizeProcess(
  process: SystemInformationProcess,
): RunningProcessMetric | null {
  if (
    typeof process.pid !== "number" ||
    !Number.isSafeInteger(process.pid) ||
    process.pid < 0
  ) {
    return null;
  }

  const name =
    typeof process.name === "string" && process.name.trim().length > 0
      ? process.name.trim().slice(0, 160)
      : UNKNOWN_PROCESS_NAME;

  return {
    pid: process.pid,
    name,
    cpuPercent: safePercent(process.cpu),
    memoryPercent: safePercent(process.mem),
  };
}

/**
 * Retrieve running-process metrics from systeminformation.
 *
 * systeminformation v5.33.16 declares processes() as returning a
 * ProcessesData object whose list is ProcessesProcessData[].
 * The documented fields used here are pid, name, cpu, and mem;
 * cpu and mem are the process CPU and memory percentages.
 *
 * This is a read-only query. It does not terminate or otherwise control
 * processes. On a failed/unavailable query it returns an empty array, and it
 * returns only plain serializable metric objects, sorted by CPU descending.
 */
export async function getRunningProcesses(): Promise<RunningProcessMetric[]> {
  let snapshot: Awaited<ReturnType<typeof si.processes>>;

  try {
    snapshot = await si.processes();
  } catch {
    return [];
  }

  const records = Array.isArray(snapshot?.list) ? snapshot.list : [];

  return records
    .map(normalizeProcess)
    .filter((process): process is RunningProcessMetric => process !== null)
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    .slice(0, MAX_RETURNED_PROCESSES);
}
