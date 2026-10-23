import MetricCard, { formatBytes } from "./components/MetricCard";
import ProcessTable from "./components/ProcessTable";
import { useSystemPulse } from "./hooks/useSystemPulse";

export default function App() {
  const { metrics, processes, loading, error, refresh } = useSystemPulse();
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="./" aria-label="SystemPulse home"><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-name">System<span>Pulse</span></span></a><div className="topbar-status"><span className={"live-dot " + (loading ? "live-dot--loading" : "")} /><span>{loading && !metrics ? "Connecting" : "Live monitoring"}</span><span className="status-divider" /><button className="refresh-button" type="button" onClick={() => void refresh()} disabled={loading}><span aria-hidden="true">↻</span> Refresh</button></div></header>
    <section className="page-intro"><div><p className="eyebrow">SYSTEM OVERVIEW</p><h1>Your system, at a glance.</h1><p className="intro-copy">Real-time performance and process activity from this device.</p></div><div className="update-note"><span className="live-dot" /> Auto-refresh every 3 seconds</div></section>
    {error && <div className="alert" role="status"><span className="alert-icon" aria-hidden="true">!</span><div><strong>Some system data could not be refreshed</strong><p>{error}{metrics ? " Showing the most recent successful metric readings where available." : ""}</p></div><button type="button" className="alert-retry" onClick={() => void refresh()} disabled={loading}>Retry</button></div>}
    {loading && !metrics && <div className="loading-banner" role="status"><span className="spinner" /> Collecting your system metrics…</div>}
    <section className="metrics-grid" aria-label="System metrics"><MetricCard title="CPU usage" percent={metrics?.cpu.loadPercent ?? 0} available={Boolean(metrics)} detail={metrics ? "Current processor utilization" : "Waiting for CPU readings"} icon={<span className="metric-glyph">⌘</span>} /><MetricCard title="Memory usage" percent={metrics?.memory.usagePercent ?? 0} available={Boolean(metrics?.memory.available)} detail={metrics ? formatBytes(metrics.memory.usedBytes) + " used of " + formatBytes(metrics.memory.totalBytes) : "Waiting for memory readings"} icon={<span className="metric-glyph">▤</span>} /><MetricCard title="Disk usage" percent={metrics?.disk.usagePercent ?? 0} available={Boolean(metrics?.disk.available)} detail={metrics ? formatBytes(metrics.disk.usedBytes) + " used of " + formatBytes(metrics.disk.totalBytes) : "Waiting for disk readings"} icon={<span className="metric-glyph">▣</span>} /></section>
    <ProcessTable processes={processes} />
    <footer className="app-footer"><span>SystemPulse <span className="footer-separator">/</span> Smart Desktop System Monitor</span><span>{metrics ? "Last successful metrics · " + new Date(metrics.sampledAt).toLocaleTimeString() : "Waiting for first successful reading"}</span></footer>
  </main>;
}
