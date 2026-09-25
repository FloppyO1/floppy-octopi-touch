/**
 * Wires the push socket to the stores. REST is used only for the initial state, after each
 * (re)connection and on events that announce a change; live data comes from the socket.
 */
import { OctoPrintSocket } from '../api/socket';
import type {
  ConnectedPayload,
  CurrentPayload,
  EventPayload,
  PluginPayload,
} from '../api/types';
import { positionFromEvent } from '../core/move';
import { capabilities } from './capabilities.svelte';
import { connection } from './connection.svelte';
import { events } from './events.svelte';
import { files } from './files.svelte';
import { notices } from './notices.svelte';
import { job, printer } from './printer.svelte';
import { prompt } from './prompt.svelte';
import { server } from './server.svelte';
import { settings } from './settings.svelte';
import { temperatures } from './temperatures.svelte';
import { terminal } from './terminal.svelte';
import { tune } from './tune.svelte';
import { usb } from './usb.svelte';

const HEALTH_RETRY_MS = 5000;

const FILE_EVENTS = new Set([
  'UpdatedFiles',
  'FileAdded',
  'FileRemoved',
  'FolderAdded',
  'FolderRemoved',
  'FileDeselected',
  'MetadataAnalysisFinished',
]);

function handleEvent({ type, payload }: EventPayload): void {
  if (FILE_EVENTS.has(type)) files.scheduleRefresh();
  switch (type) {
    case 'Connected':
      capabilities.expectReport();
      tune.reset();
      void connection.refresh();
      void server.loadProfile();
      break;
    case 'Disconnected':
      capabilities.reset();
      prompt.reset();
      tune.reset();
      printer.setPosition(null);
      void connection.refresh();
      break;
    case 'FirmwareData':
      capabilities.setFirmwareName((payload?.name as string | undefined) ?? null);
      break;
    case 'SettingsUpdated':
      void server.loadSettings();
      break;
    case 'PrinterProfileModified':
      void server.loadProfile();
      break;
    case 'PositionUpdate':
      printer.reportPosition(positionFromEvent(payload));
      break;
  }
  notices.handleEvent(type, payload);
  events.emit(type, payload);
}

function handleCurrent(current: CurrentPayload, isHistory: boolean): void {
  printer.update(current);
  job.update(current);
  if (isHistory) {
    temperatures.reset(current.temps);
    terminal.reset(current.logs);
  } else {
    temperatures.add(current.temps);
    terminal.append(current.logs);
    // Old lines from `history` must not re-open prompts that were already answered.
    prompt.ingest(current.logs);
  }
  // History lines are the recent past: good enough to know the fan/feed rate/flow after a reload.
  tune.ingest(current.logs);
  capabilities.ingest(current.logs);
  if (printer.operational && !capabilities.known) void capabilities.requestIfUnknown();
}

function handleMessage(type: string, payload: unknown): void {
  switch (type) {
    case 'connected': {
      const { version, display_version, safe_mode } = payload as ConnectedPayload;
      connection.server = { version, display_version, safe_mode };
      break;
    }
    case 'history':
    case 'current':
      handleCurrent(payload as CurrentPayload, type === 'history');
      break;
    case 'event':
      handleEvent(payload as EventPayload);
      break;
    case 'plugin': {
      const { plugin, data } = payload as PluginPayload;
      server.setPluginMessage(plugin, data);
      break;
    }
  }
}

/** Everything that must be (re)loaded over REST when the socket is (re)authenticated. */
async function loadInitialState(): Promise<void> {
  await Promise.all([
    connection.refresh(),
    server.loadSettings(),
    server.loadProfile(),
    files.refresh(),
  ]);
  await server.loadLayerValues();
}

let socket: OctoPrintSocket | null = null;
let healthTimer: ReturnType<typeof setTimeout> | null = null;

async function waitForOctoPrint(): Promise<void> {
  const health = await connection.refreshHealth();
  if (health?.octoprint.authorized) {
    socket?.connect();
  } else {
    healthTimer = setTimeout(() => void waitForOctoPrint(), HEALTH_RETRY_MS);
  }
}

/** Starts the data layer (idempotent). */
export function startDataLayer(): void {
  if (socket) return;
  socket = new OctoPrintSocket({
    throttle: 2,
    onStatus: (status) => {
      connection.socket = status;
      if (status === 'open') void loadInitialState();
    },
    onMessage: handleMessage,
  });
  void settings.load();
  usb.start();
  void waitForOctoPrint();
}

export function stopDataLayer(): void {
  if (healthTimer) clearTimeout(healthTimer);
  healthTimer = null;
  socket?.close();
  usb.stop();
  socket = null;
  connection.socket = 'closed';
}
