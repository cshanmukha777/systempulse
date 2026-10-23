import { useCallback, useEffect, useRef, useState } from "react";
import type { ServiceResponse, SystemMetrics, SystemProcess } from "../../types/systemPulse";

const POLL_INTERVAL_MS = 3000;
export interface SystemPulseData { metrics: SystemMetrics | null; processes: SystemProcess[]; loading: boolean; error: string | null; refresh: () => Promise<void>; }
function getFailure<T>(response: ServiceResponse<T>): string | null { return response.ok ? null : response.error.message; }

export function useSystemPulse(): SystemPulseData {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
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
      if (metricResult.status === "fulfilled") {
        const response = metricResult.value;
        if (response.ok) setMetrics(response.data); else failures.push(getFailure(response) ?? "Metrics unavailable.");
      } else failures.push("Unable to load system metrics.");
      const processResult = results[1];
      if (processResult.status === "fulfilled") {
        const response = processResult.value;
        if (response.ok) setProcesses(response.data); else failures.push(getFailure(response) ?? "Process information unavailable.");
      } else failures.push("Unable to load running processes.");
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
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => { mounted.current = false; window.clearInterval(id); };
  }, [refresh]);
  return { metrics, processes, loading, error, refresh };
}
