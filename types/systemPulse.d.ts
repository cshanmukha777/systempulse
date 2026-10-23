export interface SystemProcess {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryPercent: number;
}

export interface CpuMetrics {
  loadPercent: number;
  available?: boolean;
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

export interface DiskSnapshot {
  filesystem: string;
  mount: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  available?: boolean;
}

export interface SystemSnapshot {
  capturedAt: string;
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    speedGhz: number;
    loadPercent: number;
    available?: boolean;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
    available?: boolean;
  };
  disk: DiskSnapshot;
  disks: DiskSnapshot[];
  processes: SystemProcess[];
}

export type ServiceResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface SystemPulseApi {
  getMetrics(): Promise<ServiceResponse<SystemMetrics>>;
  getProcesses(): Promise<ServiceResponse<SystemProcess[]>>;
  /** Existing starter API: request a complete system snapshot. */
  getSnapshot(): Promise<SystemSnapshot>;
  /** Existing starter API: subscribe to periodic snapshots and receive an unsubscribe function. */
  onSnapshot(callback: (snapshot: SystemSnapshot) => void): () => void;
}

declare global {
  interface Window {
    systemPulse: SystemPulseApi;
  }
}

export {};
