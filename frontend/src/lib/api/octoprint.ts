/**
 * Typed OctoPrint REST client (through the agent proxy, which adds the API key).
 * Never use the absolute `refs` URLs returned by OctoPrint: they point to the upstream host.
 */
import { deleteJson, encodePath, getJson, HttpError, postJson, query } from './http';
import type {
  Axis,
  ConnectionInfo,
  ConnectParams,
  FileEntry,
  FileListing,
  FileOrigin,
  JobStatus,
  LoginResponse,
  OctoPrintSettings,
  PrinterProfile,
  PrinterStatus,
  SystemCommands,
  VersionInfo,
} from './types';

export const getVersion = () => getJson<VersionInfo>('/api/version');

/** Passive login: authenticates with the API key (added by the agent) and returns a socket session. */
export const passiveLogin = () => postJson<LoginResponse>('/api/login', { passive: true });

export const connection = {
  get: () => getJson<ConnectionInfo>('/api/connection'),
  connect: (params: ConnectParams = {}) =>
    postJson('/api/connection', { command: 'connect', ...params }),
  disconnect: () => postJson('/api/connection', { command: 'disconnect' }),
  fakeAck: () => postJson('/api/connection', { command: 'fake_ack' }),
};

export const printer = {
  /** 409 when the printer is not operational. */
  get: (exclude?: ('temperature' | 'sd' | 'state')[]) =>
    getJson<PrinterStatus>(`/api/printer${query({ exclude: exclude?.join(',') })}`),

  jog: (move: Partial<Record<Axis, number>>, opts: { absolute?: boolean; speed?: number } = {}) =>
    postJson('/api/printer/printhead', { command: 'jog', ...move, ...opts }),
  home: (axes: Axis[] = ['x', 'y', 'z']) =>
    postJson('/api/printer/printhead', { command: 'home', axes }),
  /** Feed rate override in percent (M220). */
  feedrate: (percent: number) =>
    postJson('/api/printer/printhead', { command: 'feedrate', factor: Math.round(percent) }),

  setToolTargets: (targets: Record<string, number>) =>
    postJson('/api/printer/tool', { command: 'target', targets }),
  setToolOffsets: (offsets: Record<string, number>) =>
    postJson('/api/printer/tool', { command: 'offset', offsets }),
  selectTool: (tool: string) => postJson('/api/printer/tool', { command: 'select', tool }),
  /** Extrudes (negative = retracts) `amount` mm on the current tool; `speed` in mm/min. */
  extrude: (amount: number, speed?: number) =>
    postJson('/api/printer/tool', { command: 'extrude', amount, speed }),
  /** Flow rate override in percent (M221). */
  flowrate: (percent: number) =>
    postJson('/api/printer/tool', { command: 'flowrate', factor: Math.round(percent) }),

  setBedTarget: (target: number) => postJson('/api/printer/bed', { command: 'target', target }),
  setBedOffset: (offset: number) => postJson('/api/printer/bed', { command: 'offset', offset }),
  setChamberTarget: (target: number) =>
    postJson('/api/printer/chamber', { command: 'target', target }),

  sd: {
    get: () => getJson<{ ready: boolean }>('/api/printer/sd'),
    init: () => postJson('/api/printer/sd', { command: 'init' }),
    refresh: () => postJson('/api/printer/sd', { command: 'refresh' }),
    release: () => postJson('/api/printer/sd', { command: 'release' }),
  },

  /** Sends raw G-code lines to the printer. */
  command: (commands: string | string[]) =>
    postJson('/api/printer/command', {
      commands: (Array.isArray(commands) ? commands : commands.split('\n'))
        .map((c) => c.trim())
        .filter(Boolean),
    }),
};

export const job = {
  get: () => getJson<JobStatus>('/api/job'),
  start: () => postJson('/api/job', { command: 'start' }),
  cancel: () => postJson('/api/job', { command: 'cancel' }),
  restart: () => postJson('/api/job', { command: 'restart' }),
  pause: () => postJson('/api/job', { command: 'pause', action: 'pause' }),
  resume: () => postJson('/api/job', { command: 'pause', action: 'resume' }),
};

const fileUrl = (origin: FileOrigin, path: string) => `/api/files/${origin}/${encodePath(path)}`;

export const files = {
  /** Every storage at once (local + sdcard when the SD card is ready). */
  listAll: (recursive = true) => getJson<FileListing>(`/api/files${query({ recursive })}`),
  list: (origin: FileOrigin, recursive = true) =>
    getJson<FileListing>(`/api/files/${origin}${query({ recursive })}`),
  get: (origin: FileOrigin, path: string) => getJson<FileEntry>(fileUrl(origin, path)),
  select: (origin: FileOrigin, path: string, print = false) =>
    postJson(fileUrl(origin, path), { command: 'select', print }),
  move: (path: string, destination: string) =>
    postJson(fileUrl('local', path), { command: 'move', destination }),
  copy: (path: string, destination: string) =>
    postJson(fileUrl('local', path), { command: 'copy', destination }),
  remove: (origin: FileOrigin, path: string) => deleteJson(fileUrl(origin, path)),
  /** Folder creation needs a multipart form (`foldername` + optional parent `path`). */
  createFolder: async (name: string, parent = '') => {
    const form = new FormData();
    form.append('foldername', name);
    if (parent) form.append('path', parent);
    const response = await fetch('/api/files/local', { method: 'POST', body: form });
    if (!response.ok) {
      throw new HttpError(response.status, `create folder: HTTP ${response.status}`);
    }
  },
};

export const printerProfiles = {
  list: () => getJson<{ profiles: Record<string, PrinterProfile> }>('/api/printerprofiles'),
  get: (id: string) => getJson<PrinterProfile>(`/api/printerprofiles/${encodeURIComponent(id)}`),
};

export const getSettings = () => getJson<OctoPrintSettings>('/api/settings');
/** Saves one G-code script (403 without the SETTINGS permission); OctoPrint fires SettingsUpdated. */
export const saveGcodeScript = (name: string, script: string) =>
  postJson('/api/settings', { scripts: { gcode: { [name]: script } } });

export const system = {
  commands: () => getJson<SystemCommands>('/api/system/commands'),
  run: (source: string, action: string) =>
    postJson(`/api/system/commands/${encodeURIComponent(source)}/${encodeURIComponent(action)}`, {}),
};

/** SimpleApiPlugin endpoints (`/api/plugin/<id>`). */
export const plugin = {
  get: <T>(id: string) => getJson<T>(`/api/plugin/${encodeURIComponent(id)}`),
  command: <T = void>(id: string, command: string, data: Record<string, unknown> = {}) =>
    postJson<T>(`/api/plugin/${encodeURIComponent(id)}`, { command, ...data }),
};
