import { type RichDocNode } from '@searsuite/sear-domain-doc';
import { toDocSelection } from './DocumentBoundary';
import { type DocEditModel } from '@searsuite/sear-assembly-doc';
import { createSheetDocumentFormatTransfer } from './SheetDocumentFormatTransfer';
import { runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { cloneSessionStateValue } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';
import type { SheetEditSession, SheetEmbeddedEditor, SheetRenderSession } from '@searsuite/sear-sheet-editor-contract';
import type { SheetDocumentNode, SheetEmbeddedEditorContext } from '@searsuite/sear-sheet-editor-contract';
import { cloneSheetDocument } from './DocumentBoundary';
import type { SearCoreEditorAdapterOptions } from './SearCoreEditorAdapterOptions';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  SheetEmbeddedEditHistoryObservation,
  type SheetEmbeddedEditHistoryState,
} from '@searsuite/sear-sheet-editor-contract';
import {
  registerSheetEmbeddedInlineStyleObservation,
  type SheetEmbeddedInlineStyleObservationController,
} from './SheetEmbeddedInlineStyleObservations';
import { SearCoreEditSession } from './SearCoreEditSession';
import { SearCoreEditorRuntime } from './SearCoreEditorRuntime';
import { SearCoreRenderSessionManager } from './SearCoreRenderSessionManager';
import { lockSheetEmbeddedEditorContext } from './lockSheetEmbeddedEditorContext';

/** Sheet adapter that owns one lightweight SearCoreDoc for all embedded cells. */
export class SearCoreEditorAdapter implements SheetEmbeddedEditor {
  readonly #options: SearCoreEditorAdapterOptions;

  public readonly observations = new ObservationRegistry();
  #runtime: SearCoreEditorRuntime | null = null;
  #renderSessions: SearCoreRenderSessionManager | null = null;
  #activeEditSession: SearCoreEditSession | null = null;
  readonly #editSessions = new Set<SearCoreEditSession>();
  #isCommandExecuting: (() => boolean) | undefined;
  #teardownToken: object | null = null;
  readonly #sessionOwnerToken = {};
  #observationsBoundaryInstalled = false;
  #inlineStyleObservation: SheetEmbeddedInlineStyleObservationController | null = null;
  readonly #historyListeners = new Set<(state: SheetEmbeddedEditHistoryState) => void>();
  #editingSessionActive = false;
  #disposed = false;

  public constructor(options: SearCoreEditorAdapterOptions = {}) {
    this.#options = options;
  }

  public readonly formatting = createSheetDocumentFormatTransfer(() => {
    this.#assertInitialized();
    return this.#runtime!.inlineStyles;
  });

  public measureUnwrapped(document: readonly SheetDocumentNode[], font: string): { width: number; height: number } {
    this.#assertInitialized();
    return this.#runtime!.measureUnwrapped(document, font);
  }

  public initialize(context: SheetEmbeddedEditorContext): void {
    this.#assertLive();
    lockSheetEmbeddedEditorContext(context);
    if (this.#runtime) {
      if (context.isCommandExecuting && context.isCommandExecuting !== this.#isCommandExecuting) {
        if (this.#isCommandExecuting) throw new SearError('Sheet edit command boundary is already bound to an editor.');
        SearCoreEditorRuntime.prototype.enforceCommandBoundary.call(this.#runtime, context.isCommandExecuting);
        this.#isCommandExecuting = context.isCommandExecuting;
        this.#sealObservations();
      }
      return;
    }
    this.#isCommandExecuting = context.isCommandExecuting;
    this.#runtime = new SearCoreEditorRuntime(context, this.#options);
    this.#runtime.bindTeardownToken(this.#sessionOwnerToken);
    this.#renderSessions = new SearCoreRenderSessionManager(this.#runtime);
    this.#inlineStyleObservation = registerSheetEmbeddedInlineStyleObservation(
      this.observations,
      () => {
        const session = this.#activeEditSession;
        return session
          ? {
              document: session.getDocument() as readonly RichDocNode[],
              selection: toDocSelection(session.getSelection()),
              typingStyle: session.getTypingStyle(),
            }
          : null;
      },
      this.#runtime.inlineStyles,
    );
    this.observations.register(SheetEmbeddedEditHistoryObservation, {
      getSnapshot: () =>
        this.#activeEditSession?.getHistoryStatus() ?? { editing: false, canUndo: false, canRedo: false },
      subscribe: (listener) => {
        this.#historyListeners.add(listener);
        return () => this.#historyListeners.delete(listener);
      },
    });
    this.#sealObservations();
  }

  public createRenderSession(context: SheetEmbeddedEditorContext): SheetRenderSession {
    this.#assertInitialized();
    lockSheetEmbeddedEditorContext(context);
    return this.#renderSessions!.create(context, cloneSheetDocument(context.documentAccessor.read()));
  }

  public createEditSession(context: SheetEmbeddedEditorContext, model?: DocEditModel): SheetEditSession {
    this.#assertInitialized();
    lockSheetEmbeddedEditorContext(context);
    const isCommandExecuting = this.#isCommandExecuting ?? context.isCommandExecuting;
    if (isCommandExecuting && !isCommandExecuting()) {
      throw new SearError('Sheet edit session creation must run through a command.');
    }
    if (this.#activeEditSession) throw new SearError('SearCoreEditorAdapter already has an active edit session.');
    const runtime = this.#runtime!;
    const sessionContext = { ...context, isCommandExecuting };
    this.#editingSessionActive = true;
    let session: SearCoreEditSession;
    try {
      session = new SearCoreEditSession(
        runtime,
        sessionContext,
        cloneSheetDocument(context.documentAccessor.read()),
        () => {
          if (this.#activeEditSession !== session) return;
          this.#activeEditSession = null;
          this.#editingSessionActive = false;
          this.#inlineStyleObservation?.notify();
          this.#notifyHistory();
        },
        () => this.#inlineStyleObservation?.notify(),
        () => this.#notifyHistory(),
        this.#sessionOwnerToken,
        model,
      );
    } catch (error) {
      this.#editingSessionActive = false;
      throw error;
    }
    this.#activeEditSession = session;
    this.#editSessions.add(session);
    this.#inlineStyleObservation?.notify();
    this.#notifyHistory();
    return session;
  }

  #notifyHistory(): void {
    const state = this.#activeEditSession?.getHistoryStatus() ?? { editing: false, canUndo: false, canRedo: false };
    runOutsideCommandExecution(() => this.#historyListeners.forEach((listener) => listener(state)));
  }

  public bindTeardownToken(token: object): void {
    if (this.#teardownToken) throw new SearError('Sheet embedded editor teardown is already bound.');
    this.#teardownToken = token;
  }

  public dispose(ownerToken?: object): void {
    if (this.#disposed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearError('Sheet embedded editor destruction requires its editor owner.');
    }
    this.#disposed = true;
    this.#activeEditSession = null;
    this.#editingSessionActive = false;
    this.#historyListeners.clear();
    this.observations.destroy();
    this.#inlineStyleObservation = null;
    for (const session of [...this.#editSessions].reverse()) session.dispose(this.#sessionOwnerToken);
    this.#editSessions.clear();
    this.#renderSessions?.dispose();
    this.#renderSessions = null;
    this.#runtime?.destroy(this.#sessionOwnerToken);
    this.#runtime = null;
    this.#isCommandExecuting = undefined;
  }

  #assertInitialized(): void {
    this.#assertLive();
    if (!this.#runtime || !this.#renderSessions)
      throw new SearError('SearCoreEditorAdapter must be initialized before use.');
  }

  #sealObservations(): void {
    if (!this.#isCommandExecuting || this.#observationsBoundaryInstalled) return;
    ObservationRegistry.prototype.enforceWriteBoundary.call(
      this.observations,
      () => {
        if (!this.#disposed && !this.#isCommandExecuting?.()) {
          throw new SearError('Sheet embedded observations must change through editor.commands.run(...).');
        }
      },
      runOutsideCommandExecution,
      cloneSessionStateValue,
    );
    this.#observationsBoundaryInstalled = true;
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('SearCoreEditorAdapter has been disposed.');
  }
}
