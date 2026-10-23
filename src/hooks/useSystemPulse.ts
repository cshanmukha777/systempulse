import { useCallback, useEffect, useRef, useState } from "react";
import type { ServiceResponse, SystemMetrics, SystemProcess } from "../../types/systemPulse";

export interface CpuReading { at: string; value: number; }
export interface SystemPulseData {
  metrics: SystemMetrics | null;
  processes: SystemProcess[];
  history: CpuReading[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
function getFailure<T>(response: ServiceResponse<T>): string | null { return response.ok ? null : response.error.message; }

export function useSystemPulse(refreshIntervalSeconds: number): SystemPulseData {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
  const [history, setHistory] = useState<CpuReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (!mounted.current || inFlight.current) return;
    inFlight.current = true;
    try {
      const results = await Promise.allSettled([window.systemPulse.getMetrics(), window.systemPulse.getProcesses()]);
      if (!mounted.current) return;
      const failures: string[] = [];
      const metricResult = results[0];
      if (metricResult.status === "fulfilled" && metricResult.value.ok) {
        const next = metricResult.value.data;
        const cpu = next.cpu.loadPercent;
        const validCpu = next.cpu.available !== false && Number.isFinite(cpu) && cpu >= 0 && cpu <= 100;
        const validMemory = Number.isFinite(next.memory.usagePercent) && next.memory.usagePercent >= 0 && next.memory.usagePercent <= 100 &&
          Number.isFinite(next.memory.usedBytes) && next.memory.usedBytes >= 0 && Number.isFinite(next.memory.totalBytes) && next.memory.totalBytes >= 0;
        const validDisk = Number.isFinite(next.disk.usagePercent) && next.disk.usagePercent >= 0 && next.disk.usagePercent <= 100 &&
          Number.isFinite(next.disk.usedBytes) && next.disk.usedBytes >= 0 && Number.isFinite(next.disk.totalBytes) && next.disk.totalBytes >= 0;
        if (validCpu && validMemory && validDisk) {
          setMetrics(next);
          setHistory((previous) => [...previous, { at: next.sampledAt, value: cpu }].slice(-30));
        } else failures.push("Invalid system readings received; keeping the last valid metrics.");
      } else if (metricResult.status === "fulfilled") failures.push(getFailure(metricResult.value) ?? "Metrics unavailable.");
      else failures.push("Unable to load system metrics.");
      const processResult = results[1];
      if (processResult.status === "fulfilled" && processResult.value.ok) {
        const safeProcesses = processResult.value.data.filter((process) =>
          Number.isSafeInteger(process.pid) && process.pid >= 0 && typeof process.name === "string" &&
          Number.isFinite(process.cpuPercent) && process.cpuPercent >= 0 && process.cpuPercent <= 100 &&
          Number.isFinite(process.memoryPercent) && process.memoryPercent >= 0 && process.memoryPercent <= 100
        );
        setProcesses(safeProcesses);
      } else if (processResult.status === "fulfilled") failures.push(getFailure(processResult.value) ?? "Process information unavailable.");
      else failures.push("Unable to load running processes.");
      setError(failures.length ? failures.join(" ") : null);
    } catch {
      if (mounted.current) setError("System data is temporarily unavailable.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = window.setInterval(() => void refresh(), Math.min(10, Math.max(2, refreshIntervalSeconds)) * 1000);
    return () => { mounted.current = false; window.clearInterval(id); };
  }, [refresh, refreshIntervalSeconds]);
  return { metrics, processes, history, loading, error, refresh };
}
