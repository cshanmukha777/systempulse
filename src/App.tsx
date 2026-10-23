import { useEffect, useRef, useState } from "react";
import MetricCard, { formatBytes } from "./components/MetricCard";
import ProcessTable from "./components/ProcessTable";
import CpuHistoryChart from "./components/CpuHistoryChart";
import { useSystemPulse } from "./hooks/useSystemPulse";

interface Preferences { cpuWarningThreshold: number; refreshIntervalSeconds: number; notificationsEnabled: boolean; }
const DEFAULT_PREFERENCES: Preferences = { cpuWarningThreshold: 80, refreshIntervalSeconds: 3, notificationsEnabled: false };
const PREFERENCES_KEY = "systempulse.preferences.v1";
function loadPreferences(): Preferences {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      const value = parsed as Partial<Preferences>;
      return {
        cpuWarningThreshold: typeof value.cpuWarningThreshold === "number" && Number.isFinite(value.cpuWarningThreshold) ? Math.min(100, Math.max(0, value.cpuWarningThreshold)) : DEFAULT_PREFERENCES.cpuWarningThreshold,
        refreshIntervalSeconds: typeof value.refreshIntervalSeconds === "number" && Number.isFinite(value.refreshIntervalSeconds) ? Math.min(10, Math.max(2, value.refreshIntervalSeconds)) : DEFAULT_PREFERENCES.refreshIntervalSeconds,
        notificationsEnabled: value.notificationsEnabled === true,
      };
    }
  } catch { /* Storage may be unavailable; use in-memory defaults. */ }
  return DEFAULT_PREFERENCES;
}

export default function App() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const { metrics, processes, history, loading, error, refresh } = useSystemPulse(preferences.refreshIntervalSeconds);
  const wasAboveThreshold = useRef(false);
  const cpuPercent = metrics?.cpu.loadPercent ?? 0;
  const cpuAvailable = Boolean(metrics && metrics.cpu.available !== false);
  const aboveThreshold = cpuAvailable && cpuPercent >= preferences.cpuWarningThreshold;

  useEffect(() => {
    try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Preferences still work for this session. */ }
  }, [preferences]);

  useEffect(() => {
    if (aboveThreshold && !wasAboveThreshold.current && preferences.notificationsEnabled && typeof window.Notification !== "undefined") {
      const notify = () => {
        try { new window.Notification("SystemPulse CPU warning", { body: `CPU usage is ${cpuPercent.toFixed(1)}%, above your ${preferences.cpuWarningThreshold}% threshold.` }); } catch { /* Notifications are optional. */ }
      };
      if (window.Notification.permission === "granted") notify();
    }
    wasAboveThreshold.current = aboveThreshold;
  }, [aboveThreshold, cpuPercent, preferences.cpuWarningThreshold, preferences.notificationsEnabled]);

  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }
  async function toggleNotifications(enabled: boolean) {
    if (enabled && typeof window.Notification !== "undefined" && window.Notification.permission === "default") {
      try { await window.Notification.requestPermission(); } catch { /* Permission can be denied by the platform. */ }
    }
    updatePreference("notificationsEnabled", enabled);
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="./" aria-label="SystemPulse home"><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-name">System<span>Pulse</span></span></a><div className="topbar-status"><span className={"live-dot " + (loading ? "live-dot--loading" : "")} /><span>{loading && !metrics ? "Connecting" : "Live monitoring"}</span><span className="status-divider" /><button className="refresh-button" type="button" onClick={() => void refresh()} disabled={loading}><span aria-hidden="true">↻</span> Refresh</button></div></header>
    <section className="page-intro"><div><p className="eyebrow">SYSTEM OVERVIEW</p><h1>Your system, at a glance.</h1><p className="intro-copy">Real-time performance and process activity from this device.</p></div><div className="update-note"><span className="live-dot" /> Auto-refresh every {preferences.refreshIntervalSeconds} seconds</div></section>
    {error && <div className="alert" role="status"><span className="alert-icon" aria-hidden="true">!</span><div><strong>Some system data could not be refreshed</strong><p>{error}{metrics ? " Showing the most recent successful metric readings where available." : ""}</p></div><button type="button" className="alert-retry" onClick={() => void refresh()} disabled={loading}>Retry</button></div>}
    {loading && !metrics && <div className="loading-banner" role="status"><span className="spinner" /> Collecting your system metrics…</div>}
    {aboveThreshold && <div className="cpu-warning" role="status"><span aria-hidden="true">!</span><div><strong>High CPU usage</strong><p>CPU is at {cpuPercent.toFixed(1)}%, above your {preferences.cpuWarningThreshold}% warning threshold.</p></div></div>}
    <section className="metrics-grid" aria-label="System metrics"><MetricCard title="CPU usage" percent={cpuPercent} available={cpuAvailable} detail="Current processor utilization" icon={<span className="metric-glyph">⌘</span>} /><MetricCard title="Memory usage" percent={metrics?.memory.usagePercent ?? 0} available={Boolean(metrics?.memory.available)} detail={metrics ? formatBytes(metrics.memory.usedBytes) + " used of " + formatBytes(metrics.memory.totalBytes) : "Waiting for memory readings"} icon={<span className="metric-glyph">▤</span>} /><MetricCard title="Disk usage" percent={metrics?.disk.usagePercent ?? 0} available={Boolean(metrics?.disk.available)} detail={metrics ? formatBytes(metrics.disk.usedBytes) + " used of " + formatBytes(metrics.disk.totalBytes) + " · " + metrics.disk.mount : "Waiting for disk readings"} icon={<span className="metric-glyph">▣</span>} /></section>
    <CpuHistoryChart readings={history} threshold={preferences.cpuWarningThreshold} />
    <section className="panel preferences-panel" aria-labelledby="preferences-heading">
      <div className="panel-heading"><div><h2 id="preferences-heading">Monitoring preferences</h2><p>Saved on this device and applied automatically</p></div><span className="count-pill">Local settings</span></div>
      <div className="preferences-grid">
        <label className="preference-control"><span className="preference-label">CPU warning threshold</span><span className="preference-help">Show a warning when CPU usage reaches this level.</span><span className="range-row"><input type="range" min="0" max="100" step="5" value={preferences.cpuWarningThreshold} onChange={(event) => updatePreference("cpuWarningThreshold", Number(event.target.value))} /><output>{preferences.cpuWarningThreshold}%</output></span></label>
        <label className="preference-control"><span className="preference-label">Refresh interval</span><span className="preference-help">Choose how often metrics are collected.</span><select value={preferences.refreshIntervalSeconds} onChange={(event) => updatePreference("refreshIntervalSeconds", Number(event.target.value))}>{[2,3,4,5,6,7,8,9,10].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
        <div className="preference-control"><span className="preference-label">Desktop notifications</span><span className="preference-help">Notify when CPU usage crosses the threshold.</span><label className="toggle-control"><input type="checkbox" checked={preferences.notificationsEnabled} onChange={(event) => void toggleNotifications(event.target.checked)} /><span>{preferences.notificationsEnabled ? "Enabled" : "Disabled"}</span></label>{typeof window.Notification !== "undefined" && window.Notification.permission === "denied" && <span className="preference-note">Notifications are blocked by system/browser permissions.</span>}</div>
      </div>
    </section>
    <ProcessTable processes={processes} />
    <footer className="app-footer"><span>SystemPulse <span className="footer-separator">/</span> Smart Desktop System Monitor</span><span>{metrics ? "Last successful metrics · " + new Date(metrics.sampledAt).toLocaleTimeString() : "Waiting for first successful reading"}</span></footer>
  </main>;
}
