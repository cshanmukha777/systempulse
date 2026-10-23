import type { SystemMetrics } from "../../types/systemPulse";

interface Reading { at: string; value: number; }
interface CpuHistoryChartProps { readings: Reading[]; threshold: number; }

export default function CpuHistoryChart({ readings, threshold }: CpuHistoryChartProps) {
  const width = 720;
  const height = 190;
  const pad = { top: 14, right: 12, bottom: 27, left: 34 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const points = readings.slice(-30).map((reading, index, all) => ({
    ...reading,
    x: pad.left + (all.length <= 1 ? innerWidth : (index / (all.length - 1)) * innerWidth),
    y: pad.top + (1 - Math.min(100, Math.max(0, reading.value)) / 100) * innerHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length ? `${pad.left},${pad.top + innerHeight} ${line} ${points[points.length - 1].x},${pad.top + innerHeight}` : "";
  const thresholdY = pad.top + (1 - Math.min(100, Math.max(0, threshold)) / 100) * innerHeight;
  return <section className="panel history-panel" aria-labelledby="cpu-history-heading">
    <div className="panel-heading"><div><h2 id="cpu-history-heading">CPU history</h2><p>Latest {readings.length} of 30 readings · captured at each refresh</p></div><span className="history-legend"><span className="legend-line" /> CPU load</span></div>
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`CPU usage history. ${readings.length} readings collected. Warning threshold ${threshold} percent.`} className="cpu-chart">
        {[0,25,50,75,100].map((tick) => { const y = pad.top + (1 - tick / 100) * innerHeight; return <g key={tick}><line x1={pad.left} x2={width-pad.right} y1={y} y2={y} className="chart-gridline" /><text x={pad.left-8} y={y+4} textAnchor="end" className="chart-axis-label">{tick}%</text></g>; })}
        <line x1={pad.left} x2={width-pad.right} y1={thresholdY} y2={thresholdY} className="chart-threshold" />
        {points.length > 1 && <polygon points={area} className="chart-area" />}
        {points.length > 1 && <polyline points={line} className="chart-line" />}
        {points.length === 1 && <circle cx={points[0].x} cy={points[0].y} r="4" className="chart-point" />}
        {points.length > 0 && <><text x={pad.left} y={height-5} className="chart-axis-label">{new Date(points[0].at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</text><text x={width-pad.right} y={height-5} textAnchor="end" className="chart-axis-label">{new Date(points[points.length-1].at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</text></>}
        {points.length === 0 && <text x={width/2} y={height/2} textAnchor="middle" className="chart-empty-label">Waiting for valid CPU readings…</text>}
      </svg>
    </div>
    <div className="chart-footer"><span><span className="legend-dot" /> Warning threshold: {threshold}%</span><span>{readings.length < 30 ? `${30-readings.length} more readings to fill history` : "Showing the latest 30 readings"}</span></div>
  </section>;
}
