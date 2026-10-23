import { useMemo, useState } from "react";
import type { SystemProcess } from "../../types/systemPulse";
import { formatPercent } from "./MetricCard";
type SortKey = "name" | "pid" | "cpuPercent" | "memoryPercent";
type Direction = "asc" | "desc";
interface Props { processes: SystemProcess[]; }
function compare(a: SystemProcess, b: SystemProcess, key: SortKey): number {
  const left = a[key]; const right = b[key];
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
}
export default function ProcessTable({ processes }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [direction, setDirection] = useState<Direction>("desc");
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return processes.filter((p) => p.name.toLocaleLowerCase().includes(query) || String(p.pid).includes(query)).slice().sort((a,b) => {
      const order = compare(a,b,sortKey);
      if (order) return direction === "asc" ? order : -order;
      return a.pid - b.pid || a.name.localeCompare(b.name) || a.cpuPercent - b.cpuPercent || a.memoryPercent - b.memoryPercent;
    });
  }, [processes, search, sortKey, direction]);
  function choose(key: SortKey) {
    if (key === sortKey) setDirection((old) => old === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDirection(key === "name" || key === "pid" ? "asc" : "desc"); }
  }
  function heading(key: SortKey, label: string) {
    const active = sortKey === key;
    return <th scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}><button className="sort-button" type="button" onClick={() => choose(key)}>{label}<span aria-hidden="true" className="sort-indicator">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
  }
  return <section className="panel process-panel" aria-labelledby="process-heading">
    <div className="panel-heading"><div><h2 id="process-heading">Running processes</h2><p>Live process activity from this device</p></div><span className="count-pill">{visible.length} / {processes.length}</span></div>
    <div className="table-tools"><label className="search-field"><span aria-hidden="true" className="search-icon">⌕</span><span className="sr-only">Search process name or PID</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or PID…" />{search && <button type="button" className="clear-search" onClick={() => setSearch("")} aria-label="Clear search">×</button>}</label></div>
    <div className="table-scroll"><table aria-label="Running processes sorted by selected metric"><caption className="sr-only">Running process name, process identifier, CPU percentage, and memory percentage.</caption><thead><tr>{heading("name","Process")}{heading("pid","PID")}{heading("cpuPercent","CPU")}{heading("memoryPercent","Memory")}</tr></thead><tbody>
      {visible.map((p,index) => <tr key={p.pid + ":" + p.name + ":" + index}><td><span className="process-dot" aria-hidden="true" />{p.name}</td><td className="numeric-cell">{p.pid}</td><td><span className="usage-value">{formatPercent(p.cpuPercent)}</span></td><td><span className="usage-value">{formatPercent(p.memoryPercent)}</span></td></tr>)}
    </tbody></table>{visible.length === 0 && <div className="table-empty"><span className="empty-symbol" aria-hidden="true">⌕</span><strong>{processes.length === 0 ? "No processes available" : "No matching processes"}</strong><p>{processes.length === 0 ? "Process information will appear when available." : "Try another name or PID, or clear your search."}</p>{search && <button type="button" className="text-button" onClick={() => setSearch("")}>Clear search</button>}</div>}</div>
    <div className="table-footer">Sorted by {sortKey === "cpuPercent" ? "CPU usage" : sortKey === "memoryPercent" ? "memory usage" : sortKey === "pid" ? "PID" : "process name"} · {direction === "asc" ? "ascending" : "descending"}</div>
  </section>;
}
