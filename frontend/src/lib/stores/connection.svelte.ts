/** Agent health, push socket status and the printer serial connection. */
import { getAgentHealth } from '../api/agent';
import { connection as connectionApi } from '../api/octoprint';
import type { SocketStatus } from '../api/socket';
import type { AgentHealth, ConnectedPayload, ConnectionInfo, ConnectParams } from '../api/types';

class ConnectionStore {
  agent = $state.raw<AgentHealth | null>(null);
  agentError = $state<string | null>(null);
  socket = $state<SocketStatus>('closed');
  /** OctoPrint server info from the socket `connected` message. */
  server = $state.raw<Pick<ConnectedPayload, 'version' | 'display_version' | 'safe_mode'> | null>(null);
  /** `/api/connection`: current serial connection and the available ports/baud rates/profiles. */
  info = $state.raw<ConnectionInfo | null>(null);

  /** The agent answers and OctoPrint accepts the API key. */
  authorized = $derived(this.agent?.octoprint.authorized === true);
  live = $derived(this.socket === 'open');

  async refreshHealth(): Promise<AgentHealth | null> {
    try {
      this.agent = await getAgentHealth();
      this.agentError = null;
    } catch (error) {
      this.agent = null;
      this.agentError = String(error);
    }
    return this.agent;
  }

  async refresh(): Promise<void> {
    try {
      this.info = await connectionApi.get();
    } catch {
      /* keep the last known value; the socket reports the state anyway */
    }
  }

  async connect(params: ConnectParams = {}): Promise<void> {
    await connectionApi.connect(params);
    await this.refresh();
  }

  async disconnect(): Promise<void> {
    await connectionApi.disconnect();
    await this.refresh();
  }
}

export const connection = new ConnectionStore();
