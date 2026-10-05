import { RpcClient, type JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent';

export interface PiAgentStartConfig {
  agentName: string;
  sessionId: string;
  sessionDir: string;
  cwd: string;
  autoRetry: boolean;
}

export interface PiSessionStats {
  messageCount: number;
  pendingMessageCount: number;
  sessionId: string;
  isStreaming: boolean;
}

export interface PiAgentEvent {
  type: string;
  raw?: JsonAgentSessionEvent;
  [key: string]: unknown;
}

export interface PiAgentClient {
  readonly agentName: string;
  readonly piSessionId: string;

  start(config: PiAgentStartConfig): Promise<void>;
  prompt(text: string): Promise<void>;
  waitUntilSettled(signal?: AbortSignal): Promise<void>;
  getLastAssistantText(): Promise<string | null>;
  getSessionStats(): Promise<PiSessionStats>;
  setAutoRetry(enabled: boolean): Promise<void>;
  abort(): Promise<void>;
  onEvent(handler: (event: PiAgentEvent) => void): () => void;
  isHealthy(): boolean;
  close(): Promise<void>;
}

export interface PiAgentClientFactory {
  create(config: PiAgentStartConfig): Promise<PiAgentClient>;
}

export class RpcPiAgentClient implements PiAgentClient {
  readonly agentName: string;
  readonly piSessionId: string;

  private readonly listeners = new Set<(event: PiAgentEvent) => void>();
  private readonly client: RpcClient;
  private started = false;
  private settled = false;
  private runtimeListenerAttached = false;

  constructor(config: { agentName: string; piSessionId: string; cwd?: string; cliPath?: string }) {
    this.agentName = config.agentName;
    this.piSessionId = config.piSessionId;
    this.client = new RpcClient({ cwd: config.cwd, cliPath: config.cliPath });
  }

  async start(config: PiAgentStartConfig): Promise<void> {
    if (!this.runtimeListenerAttached) {
      this.client.onEvent((event) => {
        const payload: PiAgentEvent = { type: event.type, raw: event };
        Object.assign(payload, event);
        this.emit(payload);

        if (event.type === 'agent_settled') {
          this.settled = true;
        }
      });
      this.runtimeListenerAttached = true;
    }

    this.started = true;
    this.settled = false;
    await this.client.start();
    this.emit({ type: 'session_start', sessionId: config.sessionId, raw: undefined });
  }

  async prompt(text: string): Promise<void> {
    if (!this.started) {
      throw new Error('Pi RPC client must be started before prompting.');
    }

    await this.client.prompt(text);
  }

  async waitUntilSettled(_signal?: AbortSignal): Promise<void> {
    if (!this.started) {
      return;
    }

    await this.client.waitForIdle();
  }

  async getLastAssistantText(): Promise<string | null> {
    return this.client.getLastAssistantText();
  }

  async getSessionStats(): Promise<PiSessionStats> {
    const stats = await this.client.getSessionStats();
    return {
      messageCount: stats.totalMessages,
      pendingMessageCount: 0,
      sessionId: this.piSessionId,
      isStreaming: false,
    };
  }

  async setAutoRetry(enabled: boolean): Promise<void> {
    await this.client.setAutoRetry(enabled);
  }

  async abort(): Promise<void> {
    await this.client.abort();
  }

  onEvent(handler: (event: PiAgentEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  isHealthy(): boolean {
    return this.started;
  }

  async close(): Promise<void> {
    this.started = false;
    this.settled = false;
    await this.client.stop();
    this.emit({ type: 'session_end' });
  }

  private emit(event: PiAgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export class ScriptedPiAgentClient implements PiAgentClient {
  readonly agentName: string;
  readonly piSessionId: string;

  private readonly listeners = new Set<(event: PiAgentEvent) => void>();
  private started = false;
  private settled = false;
  private lastAssistantText: string | null = null;
  private waitingResolvers: Array<() => void> = [];
  private promptIndex = 0;

  constructor(config: { agentName: string; piSessionId: string }) {
    this.agentName = config.agentName;
    this.piSessionId = config.piSessionId;
  }

  async start(config: PiAgentStartConfig): Promise<void> {
    this.started = true;
    this.settled = false;
    this.lastAssistantText = null;
    this.emit({ type: 'session_start', sessionId: config.sessionId });
  }

  async prompt(text: string): Promise<void> {
    if (!this.started) {
      throw new Error('The scripted Pi client must be started before prompting.');
    }

    this.promptIndex += 1;
    const normalizedName = this.agentName.toLowerCase();
    const responseText = normalizedName === 'ceo'
      ? 'The board should proceed with the offer.'
      : normalizedName.includes('revenue')
        ? 'The board should proceed with the offer.'
        : 'The final argument is to keep the lower-risk path.';

    this.lastAssistantText = responseText;
    this.emit({ type: 'message_update', text, response: responseText });
    this.emit({ type: 'agent_settled', text: responseText });
    this.settled = true;
    this.waitingResolvers.splice(0).forEach((resolve) => resolve());
  }

  async waitUntilSettled(_signal?: AbortSignal): Promise<void> {
    if (this.settled) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.waitingResolvers.push(resolve);
    });
  }

  async getLastAssistantText(): Promise<string | null> {
    return this.lastAssistantText;
  }

  async getSessionStats(): Promise<PiSessionStats> {
    return {
      messageCount: this.promptIndex,
      pendingMessageCount: 0,
      sessionId: this.piSessionId,
      isStreaming: false,
    };
  }

  async setAutoRetry(_enabled: boolean): Promise<void> {
    // The scripted client intentionally keeps retry semantics simple.
    // Production integrations should route this to the runtime-owned boundary.
  }

  async abort(): Promise<void> {
    this.emit({ type: 'abort' });
  }

  onEvent(handler: (event: PiAgentEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  isHealthy(): boolean {
    return this.started;
  }

  async close(): Promise<void> {
    this.started = false;
    this.emit({ type: 'session_end' });
  }

  private emit(event: PiAgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
