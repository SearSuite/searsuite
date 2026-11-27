import {
  CollaborationChannel,
  CollaborationChannelBinding,
  CollaborationConnectionState,
  type CollaborationStatus,
  type CollabTransport,
} from '@searsuite/sear-plugin-collab';
import { SearContractViolationError } from '@searsuite/sear-assembly-plugin';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import {
  WorkbookPlugin,
  type WorkbookCompanionSheetPluginContext,
  type WorkbookPluginContext,
} from '../../WorkbookPluginContracts';
import {
  defineWorkbookRuntimeCapability,
  type WorkbookRuntimeExtensionRegistry,
} from '../../WorkbookRuntimeExtensionRegistry';
import { type WorkbookTransactionCommittedEvent } from '../../WorkbookTransaction';
import { type WorkbookCommandBus } from '../../WorkbookCommandBus';
import {
  ConnectWorkbookCollaborationCommand,
  DisconnectWorkbookCollaborationCommand,
  ApplyWorkbookCollaborationEventCommand,
} from './WorkbookCollaborationCommands';

/** Creates one transport per Workbook-owned Sheet collaboration channel. */
export interface WorkbookCollaborationTransportFactory {
  create(): CollabTransport;
}

export const WorkbookCollaborationTransportFactory = {
  symbol: Symbol.for('WorkbookCollaborationTransportFactory'),
} as const;

/** Read-only host facade for Workbook-owned collaboration channels. */
export interface WorkbookCollaborationSession {
  getSheetStatus(sheetId: WorkbookSheetId): CollaborationStatus | undefined;
  getConnectedSheetIds(): readonly WorkbookSheetId[];
}

export const WorkbookCollaborationCapability = defineWorkbookRuntimeCapability<WorkbookCollaborationSession>(
  'workbook.runtime.collaboration',
);

/** Owns collaboration state beyond the lifetime of any temporary active SheetEditor. */
@Injectable()
export class WorkbookCollaborationPlugin extends WorkbookPlugin implements WorkbookCollaborationSession {
  readonly #transports: WorkbookCollaborationTransportFactory;
  readonly #platform: Platform;

  public static readonly symbol = Symbol.for('WorkbookCollaborationPlugin');

  readonly #channels = new Map<WorkbookSheetId, CollaborationChannel>();
  #runtime: WorkbookPluginContext['runtime'] | null = null;
  #tearingDown = false;

  public constructor(
    @Inject(WorkbookCollaborationTransportFactory.symbol)
    transports: WorkbookCollaborationTransportFactory,
    @Inject(Platform.symbol) platform: Platform,
  ) {
    super();
    this.#transports = transports;
    this.#platform = platform;
  }

  public registerCapabilities(registry: WorkbookRuntimeExtensionRegistry): void {
    registry.register(
      WorkbookCollaborationCapability,
      Object.freeze({
        getSheetStatus: (sheetId: WorkbookSheetId) => this.getSheetStatus(sheetId),
        getConnectedSheetIds: () => this.getConnectedSheetIds(),
      }),
    );
  }

  public registerCommands(commands: WorkbookCommandBus): void {
    commands.register(ConnectWorkbookCollaborationCommand, ({ sheetId, options }) => {
      this.#assertKnownSheet(sheetId);
      return this.#getOrCreateChannel(sheetId).connect(options);
    });
    commands.register(DisconnectWorkbookCollaborationCommand, ({ sheetId }) => {
      this.#assertKnownSheet(sheetId);
      this.#channels.get(sheetId)?.disconnect();
    });
    commands.register(ApplyWorkbookCollaborationEventCommand, ({ sheetId, event }) => {
      this.#channels.get(sheetId)?.applyExternalEvent(event);
    });
  }

  public getSheetServices(context: WorkbookCompanionSheetPluginContext) {
    return [
      {
        token: CollaborationChannelBinding.symbol,
        value: {
          channel: this.#getOrCreateChannel(context.sheetId),
          owner: 'host',
        } satisfies CollaborationChannelBinding,
      },
    ];
  }

  public initialize(context: WorkbookPluginContext): () => void {
    this.#runtime = context.runtime;
    this.#channels.forEach((channel, sheetId) =>
      CollaborationChannel.prototype.enforceCommandBoundary.call(
        channel,
        this.#assertChannelWrite,
        context.runtime.commands.runWithoutMutationAuthority.bind(context.runtime.commands),
        (event) => {
          context.runtime.commands.run(ApplyWorkbookCollaborationEventCommand, { sheetId, event });
        },
      ),
    );
    return () => {
      this.#runtime = null;
    };
  }

  public onTransactionCommitted(event: WorkbookTransactionCommittedEvent): void {
    if (!this.#runtime?.commands.isExecuting()) {
      throw new SearContractViolationError('Workbook collaboration changes must run through editor.commands.run(...).');
    }
    const liveSheetIds = new Set(event.after.documentState.sheets.map((sheet) => sheet.id));
    this.#channels.forEach((channel, sheetId) => {
      if (liveSheetIds.has(sheetId)) return;
      channel.destroy();
      this.#channels.delete(sheetId);
    });
  }

  public getSheetStatus(sheetId: WorkbookSheetId): CollaborationStatus | undefined {
    this.#assertKnownSheet(sheetId);
    return this.#channels.get(sheetId)?.getStatus();
  }

  public getConnectedSheetIds(): readonly WorkbookSheetId[] {
    return [...this.#channels.entries()]
      .filter(([, channel]) => channel.getStatus().state !== CollaborationConnectionState.Disconnected)
      .map(([sheetId]) => sheetId);
  }

  public onWorkbookDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#tearingDown = true;
    [...this.#channels.values()].reverse().forEach((channel) => channel.destroy());
    this.#channels.clear();
    this.#runtime = null;
  }

  #getOrCreateChannel(sheetId: WorkbookSheetId): CollaborationChannel {
    const existing = this.#channels.get(sheetId);
    if (existing) return existing;
    const channel = new CollaborationChannel(() => this.#transports.create(), this.#platform);
    if (this.#runtime)
      CollaborationChannel.prototype.enforceCommandBoundary.call(
        channel,
        this.#assertChannelWrite,
        this.#runtime.commands.runWithoutMutationAuthority.bind(this.#runtime.commands),
        (event) => {
          this.#runtime?.commands.run(ApplyWorkbookCollaborationEventCommand, { sheetId, event });
        },
      );
    this.#channels.set(sheetId, channel);
    return channel;
  }

  readonly #assertChannelWrite = (): void => {
    if (this.#tearingDown || this.#runtime?.commands.isExecuting()) return;
    try {
      if (this.#runtime?.sheets.getActiveClient().commands.isExecuting()) return;
    } catch {
      // A sheet may be temporarily unmounted during an active Workbook command.
    }
    throw new SearContractViolationError('Collaboration state must change through editor.commands.run(...).');
  };

  #assertKnownSheet(sheetId: WorkbookSheetId): void {
    if (!this.#runtime) return;
    if (this.#runtime.document.getState().sheets.some((sheet) => sheet.id === sheetId)) return;
    throw new SearError(`Workbook sheet "${sheetId}" does not exist.`, { sheetId });
  }
}
