import type { ReactNode } from "react";
import { clampPercent, formatPercent, formatBytes } from "../utils/formatters.mjs";
export { formatPercent, formatBytes } from "../utils/formatters.mjs";
interface MetricCardProps { title: string; percent: number; detail: string; icon: ReactNode; available?: boolean; }
export default function MetricCard({ title, percent, detail, icon, available = true }: MetricCardProps) {
  const safePercent = clampPercent(percent);
  return <article className="metric-card"><div className="metric-card__top"><div className="metric-card__icon" aria-hidden="true">{icon}</div><span className="metric-card__label">{title}</span>{!available && <span className="status-pill">Unavailable</span>}</div><div className="metric-card__value">{available ? formatPercent(safePercent) : "—"}</div><div className="progress-track" role="progressbar" aria-label={title + " usage"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={available ? safePercent : 0}><div className="progress-fill" style={{ width: safePercent + "%" }} /></div><p className="metric-card__detail">{detail}</p></article>;
}
