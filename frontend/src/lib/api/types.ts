/**
 * OctoPrint 1.11 API types (only the fields the dashboard uses).
 * Verified against the dev container; see https://docs.octoprint.org/en/master/api/
 */

export interface VersionInfo {
  api: string;
  server: string;
  text: string;
}

export interface LoginResponse {
  name: string;
  session: string;
}

// ------------------------------------------------------------------ connection

export interface ConnectionCurrent {
  state: string;
  port: string | null;
  baudrate: number | null;
  printerProfile: string;
}

export interface ConnectionOptions {
  ports: string[];
  baudrates: number[];
  printerProfiles: { id: string; name: string }[];
  portPreference: string | null;
  baudratePreference: number | null;
  printerProfilePreference: string | null;
  autoconnect?: boolean;
}

export interface ConnectionInfo {
  current: ConnectionCurrent;
  options: ConnectionOptions;
}

export interface ConnectParams {
  port?: string;
  baudrate?: number;
  printerProfile?: string;
  save?: boolean;
  autoconnect?: boolean;
}

// ------------------------------------------------------------------ printer state

export interface PrinterStateFlags {
  operational: boolean;
  printing: boolean;
  cancelling: boolean;
  pausing: boolean;
  resuming: boolean;
  finishing: boolean;
  closedOrError: boolean;
  error: boolean;
  paused: boolean;
  ready: boolean;
  sdReady: boolean;
}

export interface PrinterState {
  text: string;
  flags: PrinterStateFlags;
  error?: string;
}

export interface HeaterReading {
  actual: number | null;
  target: number | null;
  offset?: number;
}

/** One entry of `current.temps` / `history.temps` in the push API. */
export interface TemperatureSample {
  time: number;
  [heater: string]: HeaterReading | number;
}

export interface PrinterStatus {
  state: PrinterState;
  temperature?: Record<string, HeaterReading>;
  sd?: { ready: boolean };
}

export type Axis = 'x' | 'y' | 'z';

// ------------------------------------------------------------------ job

export interface JobFile {
  name: string | null;
  display?: string | null;
  path: string | null;
  size: number | null;
  origin: FileOrigin | null;
  date: number | null;
}

export interface JobInfo {
  file: JobFile;
  estimatedPrintTime: number | null;
  lastPrintTime: number | null;
  filament: Record<string, { length: number | null; volume: number | null }> | {
    length: number | null;
    volume: number | null;
  } | null;
  user: string | null;
}

export interface JobProgress {
  completion: number | null;
  filepos: number | null;
  printTime: number | null;
  printTimeLeft: number | null;
  printTimeLeftOrigin: string | null;
}

export interface JobStatus {
  job: JobInfo;
  progress: JobProgress;
  state: string;
  error?: string;
}

// ------------------------------------------------------------------ files

export type FileOrigin = 'local' | 'sdcard';

export interface GcodeAnalysis {
  estimatedPrintTime?: number | null;
  filament?: Record<string, { length?: number | null; volume?: number | null }>;
  dimensions?: { width: number; depth: number; height: number };
  printingArea?: Record<'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ', number>;
}

export interface PrintStats {
  success: number;
  failure: number;
  last?: { date: number; success: boolean; printTime?: number };
}

export interface FileEntry {
  name: string;
  display: string;
  path: string;
  type: 'machinecode' | 'model' | 'folder';
  typePath: string[];
  origin: FileOrigin;
  size?: number;
  date?: number | null;
  gcodeAnalysis?: GcodeAnalysis;
  prints?: PrintStats;
  /** Relative URL added by the Slicer Thumbnails plugin (when installed). */
  thumbnail?: string;
  /** Folders only (recursive listings). */
  children?: FileEntry[];
}

export interface FileListing {
  files: FileEntry[];
  free?: number;
  total?: number;
}

// ------------------------------------------------------------------ printer profiles

export interface PrinterProfile {
  id: string;
  name: string;
  model: string;
  current: boolean;
  default: boolean;
  heatedBed: boolean;
  heatedChamber: boolean;
  volume: {
    width: number;
    depth: number;
    height: number;
    formFactor: 'rectangular' | 'circular';
    origin: 'lowerleft' | 'center';
  };
  axes: Record<'x' | 'y' | 'z' | 'e', { speed: number; inverted: boolean }>;
  extruder: { count: number; nozzleDiameter: number; defaultExtrusionLength: number };
}

// ------------------------------------------------------------------ settings (subset)

export interface WebcamInfo {
  name: string;
  displayName: string;
  provider: string;
  canSnapshot: boolean;
  flipH: boolean;
  flipV: boolean;
  rotate90: boolean;
  compat?: { stream?: string; snapshot?: string; streamRatio?: string };
}

export interface OctoPrintSettings {
  appearance?: { name?: string };
  feature?: { sdSupport?: boolean };
  serial?: { port?: string; baudrate?: number; autoconnect?: boolean };
  temperature?: { profiles: { name: string; extruder: number; bed: number }[]; cutoff: number };
  webcam?: {
    webcamEnabled?: boolean;
    streamUrl?: string;
    snapshotUrl?: string;
    webcams?: WebcamInfo[];
  };
  plugins?: Record<string, unknown>;
}

// ------------------------------------------------------------------ system commands

export interface SystemCommand {
  action: string;
  name: string;
  source: 'core' | 'custom' | 'plugin';
  confirm?: string;
}

export type SystemCommands = Record<'core' | 'custom' | 'plugin', SystemCommand[]>;

// ------------------------------------------------------------------ push API payloads

export interface ConnectedPayload {
  version: string;
  display_version: string;
  config_hash: string;
  plugin_hash: string;
  safe_mode: string | null;
  online: boolean;
}

export interface CurrentPayload {
  state: PrinterState;
  job: JobInfo;
  progress: JobProgress;
  currentZ: number | null;
  offsets: Record<string, number>;
  temps: TemperatureSample[];
  logs: string[];
  messages: string[];
  busyFiles: { origin: FileOrigin; path: string }[];
  serverTime: number;
}

export interface EventPayload {
  type: string;
  payload: Record<string, unknown> | null;
}

export interface PluginPayload {
  plugin: string;
  data: unknown;
}

export interface ReauthPayload {
  reason: 'logout' | 'stale' | 'removed' | 'modified' | string;
}

// ------------------------------------------------------------------ agent

export interface AgentHealth {
  status: string;
  version: string;
  apiKeyConfigured: boolean;
  octoprint: { reachable: boolean; authorized: boolean; version: string | null; error?: string };
}

/** A USB stick mounted on the Pi (`id` = mount point name, e.g. `usb0`). */
export interface UsbMount {
  id: string;
  name: string;
}

/** A G-code file on a stick; `path` is relative to the mount, `date` in seconds. */
export interface UsbFile {
  mount: string;
  path: string;
  name: string;
  size: number;
  date: number;
}

/** `GET /local/usb`. */
export interface UsbListing {
  mounts: UsbMount[];
  files: UsbFile[];
}

/** Last line of the `POST /local/usb/import` stream. */
export interface UsbImportResult {
  name: string;
  /** Path in OctoPrint's local storage. */
  path: string;
}

/** One network interface of the Pi (`/local/system`). */
export interface NetworkInterface {
  name: string;
  /** `/sys/class/net/<name>/operstate`: up, down, dormant, unknown… */
  state: string;
  mac: string | null;
  ipv4: string | null;
  wireless: boolean;
}

export interface NetworkInfo {
  /** Interface of the default route (else the first with an address). */
  primary: string | null;
  gateway: string | null;
  interfaces: NetworkInterface[];
  /** First radio (the one of the default route); `ssid` only with NetworkManager. */
  wifi: { interface: string; connected: boolean; ssid: string | null; signal: number | null } | null;
}

/** `GET /local/system`: sizes in bytes, frequencies in MHz, temperatures in °C. */
export interface SystemInfo {
  version: string;
  hostname: string;
  uptime: number | null;
  cpu: {
    percent: number | null;
    cores: number | null;
    temperature: number | null;
    frequency: number | null;
    maxFrequency: number | null;
    load: [number, number, number] | null;
  };
  memory: { total: number; used: number; percent: number } | null;
  disk: { path: string; total: number; used: number; free: number; percent: number | null } | null;
  network: NetworkInfo;
}

/** `GET/PUT /local/apikey`: never the key itself. */
export interface ApiKeyState {
  configured: boolean;
  /** Last four characters, e.g. `…a1b2`. */
  hint: string | null;
  source: 'env' | 'file' | 'none';
  /** False when the key comes from the environment (it wins again at the next start). */
  persistent: boolean;
}
