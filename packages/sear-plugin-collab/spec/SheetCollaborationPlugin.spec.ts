import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Plugin, PluginKey, PluginManager } from '@searsuite/sear-assembly-plugin';
import { MatrixOTActionName, MatrixTransactionOT, type Operation } from '@searsuite/sear-domain-ot';
import {
  CollaborationProtocolVersion,
  type CollaborationClientMessage,
  type CollaborationServerMessage,
} from '@searsuite/sear-domain-collaboration';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';

import {
  CollabTransport,
  CollaborationChannel,
  CollaborationConnectionState,
  HeadlessCollabTransport,
  SheetCollaborationPlugin,
  type CollaborationTransportConnectOptions,
} from '../src';

class CollaborativeStatePlugin extends Plugin<null> {
  public override readonly transactionOT = {
    ownerId: 'third-party.cells',
    definition: MatrixTransactionOT,
    collaborative: true,
  };

  public constructor() {
    super({ key: new PluginKey('CollaborativeState'), state: null });
  }

  public apply(): null {
    return null;
  }

  public registerState() {
    return { key: this.key, state: null };
  }
}

class TestTransport extends CollabTransport {
  public readonly connections: CollaborationTransportConnectOptions[] = [];
  public readonly sent: CollaborationClientMessage[] = [];
  public disconnectCount = 0;
  readonly #listeners = new Set<(message: CollaborationServerMessage) => void>();

  public connect(options: CollaborationTransportConnectOptions): Promise<void> {
    this.connections.push(options);
    return Promise.resolve();
  }

  public disconnect(): void {
    this.disconnectCount += 1;
  }

  public send(message: CollaborationClientMessage): void {
    this.sent.push(message);
  }

  public subscribe(listener: (message: CollaborationServerMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public emit(message: CollaborationServerMessage): void {
    this.#listeners.forEach((listener) => listener(message));
  }

  public get listenerCount(): number {
    return this.#listeners.size;
  }
}

class DeferredTransport extends TestTransport {
  public readonly attempts: Array<{ resolve(): void; reject(error: Error): void }> = [];

  public override connect(options: CollaborationTransportConnectOptions): Promise<void> {
    super.connect(options);
    return new Promise<void>((resolve, reject) => {
      this.attempts.push({ resolve, reject });
    });
  }
}

function createCollaborativeTransaction(owner: CollaborativeStatePlugin, value: string): Transaction {
  const transaction = createTransaction(owner.key);
  transaction.addOperation([
    {
      p: [0, 0],
      [MatrixOTActionName.UpdateCell]: { value, prev: null },
    },
  ]);
  return transaction;
}

function createRuntime() {
  const owner = new CollaborativeStatePlugin();
  const plugins = new PluginManager();
  plugins.registerPlugin(owner);
  const commands = new SheetCommandBus();
  const executePipeline = jest.fn();
  commands.bind({ executePipeline, applyEffect: () => void 0 });
  const transport = new TestTransport();
  const platform = { warn: jest.fn(), createId: jest.fn(() => 'client-test') };
  const channel = new CollaborationChannel(transport, platform);
  const collaboration = new SheetCollaborationPlugin({ channel, owner: 'editor' }, plugins as never, commands);
  collaboration.registerCommands(commands);
  collaboration.start();
  return { channel, collaboration, commands, executePipeline, owner, platform, transport };
}

describe('SheetCollaborationPlugin', () => {
  it('retains collaboration owner identity independently of the caller object', () => {
    const channel = new CollaborationChannel(new TestTransport(), { warn: jest.fn(), createId: () => 'client-test' });
    const definition = { ...MatrixTransactionOT, id: 'test.retained-owner' };
    const contribution = { ownerId: 'test.owner', definition };
    channel.registerContributor(contribution);
    Object.assign(contribution, { ownerId: 'forged', definition: MatrixTransactionOT });

    expect(() => channel.registerContributor({ ownerId: 'test.owner', definition })).not.toThrow();
    channel.destroy();
  });

  it('ignores a connection result after disconnect or a newer connection', async () => {
    const transport = new DeferredTransport();
    const channel = new CollaborationChannel(transport, { warn: jest.fn(), createId: () => 'client-test' });
    const first = channel.connect({ url: 'ws://example.test', resourceId: 'first' });
    channel.disconnect();
    transport.attempts[0]?.resolve();
    await first;
    expect(channel.getStatus().state).toBe(CollaborationConnectionState.Disconnected);

    const stale = channel.connect({ url: 'ws://example.test', resourceId: 'stale' });
    const current = channel.connect({ url: 'ws://example.test', resourceId: 'current' });
    transport.attempts[1]?.reject(new Error('stale connection failed'));
    await expect(stale).rejects.toThrow('stale connection failed');
    expect(channel.getStatus()).toMatchObject({
      state: CollaborationConnectionState.Connecting,
      resourceId: 'current',
    });
    transport.attempts[2]?.resolve();
    await current;
    expect(channel.getStatus()).toMatchObject({
      state: CollaborationConnectionState.Online,
      resourceId: 'current',
    });
    channel.destroy();
  });

  it('does not revive a destroyed channel when a pending connection resolves', async () => {
    const transport = new DeferredTransport();
    const channel = new CollaborationChannel(transport, { warn: jest.fn(), createId: () => 'client-test' });
    const pending = channel.connect({ url: 'ws://example.test', resourceId: 'sheet-1' });
    channel.destroy();
    transport.attempts[0]?.resolve();
    await pending;
    expect(channel.getStatus().state).toBe(CollaborationConnectionState.Disconnected);
  });

  it('lets a newer connection supersede a reentrant connection request', async () => {
    const transport = new DeferredTransport();
    const channel = new CollaborationChannel(transport, { warn: jest.fn(), createId: () => 'client-test' });
    let nested: Promise<void> | undefined;
    let started = false;
    channel.subscribeStatus((status) => {
      if (status.state !== CollaborationConnectionState.Disconnected || started) return;
      started = true;
      nested = channel.connect({ url: 'ws://example.test', resourceId: 'newer' });
    });

    await channel.connect({ url: 'ws://example.test', resourceId: 'older' });
    expect(transport.connections).toHaveLength(1);
    expect(transport.connections[0]?.resourceId).toBe('newer');
    transport.attempts[0]?.resolve();
    await nested;
    expect(channel.getStatus()).toMatchObject({
      state: CollaborationConnectionState.Online,
      resourceId: 'newer',
    });
    channel.destroy();
  });

  it('rejects reconnect attempts made by listeners during destruction', async () => {
    const transport = new TestTransport();
    const channel = new CollaborationChannel(transport, { warn: jest.fn(), createId: () => 'client-test' });
    await channel.connect({ url: 'ws://example.test', resourceId: 'sheet-1' });
    let reconnect: Promise<void> | undefined;
    channel.subscribeStatus((status) => {
      if (status.state === CollaborationConnectionState.Disconnected)
        reconnect = channel.connect({ url: 'ws://example.test', resourceId: 'sheet-1' });
    });

    channel.destroy();
    await expect(reconnect).rejects.toThrow('destroyed');
    expect(channel.getStatus().state).toBe(CollaborationConnectionState.Disconnected);
  });

  it('publishes committed owner transactions without inspecting concrete OT actions', async () => {
    const { collaboration, owner, transport } = createRuntime();
    await collaboration.connect({ url: 'ws://example.test', resourceId: 'sheet-1' });

    collaboration.onTransactionCommitted(createCollaborativeTransaction(owner, 'local'));

    expect(transport.connections).toEqual([{ url: 'ws://example.test', resourceId: 'sheet-1', revision: 0 }]);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      kind: 'submit',
      ownerId: 'third-party.cells',
      operationType: { id: 'sear.matrix', version: 1 },
      baseRevision: 0,
    });
    expect(collaboration.getStatus()).toMatchObject({
      state: CollaborationConnectionState.Online,
      pendingCount: 1,
    });
  });

  it('routes accepted remote batches through the registered local owner and command bus', async () => {
    const { collaboration, executePipeline, transport } = createRuntime();
    await collaboration.connect({ url: 'ws://example.test', resourceId: 'sheet-1' });

    transport.emit({
      kind: 'accepted',
      protocolVersion: CollaborationProtocolVersion,
      resourceId: 'sheet-1',
      clientId: 'remote',
      operationId: 'remote:1',
      ownerId: 'third-party.cells',
      operationType: { id: 'sear.matrix', version: 1 },
      baseRevision: 0,
      serverRevision: 1,
      payload: [
        {
          p: [0, 0],
          [MatrixOTActionName.UpdateCell]: { value: 'remote', prev: null },
        },
      ],
    });

    expect(executePipeline).toHaveBeenCalledTimes(1);
    const transaction = executePipeline.mock.calls[0]?.[0].steps[0]?.transaction;
    expect(transaction.operations as Operation[]).toHaveLength(1);
  });

  it('disposes the transport subscription and resets transient state idempotently', async () => {
    const { collaboration, transport } = createRuntime();
    await collaboration.connect({ url: 'ws://example.test', resourceId: 'sheet-1' });
    expect(transport.listenerCount).toBe(1);

    collaboration.destroy();
    collaboration.destroy();

    expect(transport.listenerCount).toBe(0);
    expect(transport.disconnectCount).toBe(1);
    expect(collaboration.getStatus().state).toBe(CollaborationConnectionState.Disconnected);
  });

  it('provides a no-effect headless transport with disposable subscriptions', async () => {
    const transport = new HeadlessCollabTransport();
    const dispose = transport.subscribe(() => void 0);
    await expect(transport.connect({ url: 'ws://unused', resourceId: 'local', revision: 0 })).resolves.toBeUndefined();
    expect(() => dispose()).not.toThrow();
    expect(() => transport.disconnect()).not.toThrow();
  });
});
