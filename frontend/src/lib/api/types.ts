/** Subset of the OctoPrint API types used so far (extended in the data layer). */

export interface VersionInfo {
  api: string;
  server: string;
  text: string;
}

export interface ConnectionInfo {
  current: {
    state: string;
    port: string | null;
    baudrate: number | null;
    printerProfile: string;
  };
}

export interface LoginResponse {
  name: string;
  session: string;
}

export interface AgentHealth {
  status: string;
  version: string;
  apiKeyConfigured: boolean;
  octoprint: { reachable: boolean; authorized: boolean; version: string | null; error?: string };
}

export interface HeaterReading {
  actual: number | null;
  target: number | null;
}

/** One entry of `current.temps` / `history.temps` in the push API. */
export interface TemperatureSample {
  time: number;
  [heater: string]: HeaterReading | number;
}

export interface CurrentPayload {
  state: { text: string; flags: Record<string, boolean> };
  temps: TemperatureSample[];
  serverTime?: number;
}
