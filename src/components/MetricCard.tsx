import type { ReactNode } from "react";
interface MetricCardProps { title: string; percent: number; detail: string; icon: ReactNode; available?: boolean; }
function clampPercent(value: number): number { return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0; }
export function formatPercent(value: number): string { return clampPercent(value).toFixed(1) + "%"; }
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  if (value === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return (value / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1) + " " + units[exponent];
}
export default function MetricCard({ title, percent, detail, icon, available = true }: MetricCardProps) {
  const safePercent = clampPercent(percent);
  return <article className="metric-card"><div className="metric-card__top"><div className="metric-card__icon" aria-hidden="true">{icon}</div><span className="metric-card__label">{title}</span>{!available && <span className="status-pill">Unavailable</span>}</div><div className="metric-card__value">{available ? formatPercent(safePercent) : "—"}</div><div className="progress-track" role="progressbar" aria-label={title + " usage"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={available ? safePercent : 0}><div className="progress-fill" style={{ width: safePercent + "%" }} /></div><p className="metric-card__detail">{detail}</p></article>;
}
