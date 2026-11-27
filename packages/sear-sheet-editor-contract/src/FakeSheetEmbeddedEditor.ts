import { SearError } from '@searsuite/sear-foundation-error';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { SheetEditSession, SheetEmbeddedEditor, SheetRenderSession } from './SheetEmbeddedEditor';
import type { SheetEmbeddedEditorContext } from './SheetEditorTypes';
import type { SheetEditInput } from '@searsuite/sear-assembly-doc';
import { FakeEditSession } from './FakeEditSession';
import { FakeRenderSession } from './FakeRenderSession';
import { cloneDocument } from './cloneDocument';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';

/**
 * Small deterministic editor used by Sheet tests. It intentionally models only
 * the contract boundary, making no assumptions about a concrete Doc runtime.
 */
export class FakeSheetEmbeddedEditor implements SheetEmbeddedEditor {
  public readonly observations = new ObservationRegistry();
  public readonly inputs: SheetEditInput[] = [];
  public readonly committedDocuments: Schema[][] = [];
  public initializeCount = 0;
  public disposeCount = 0;
  public cancelCount = 0;
  public readonly renderContexts: SheetEmbeddedEditorContext[] = [];
  public readonly editContexts: SheetEmbeddedEditorContext[] = [];
  public readonly renderSessions: FakeRenderSession[] = [];

  #disposed = false;
  #isCommandExecuting: (() => boolean) | undefined;
  #teardownToken: object | null = null;
  readonly #sessionOwnerToken = {};
  readonly #editSessions = new Set<FakeEditSession>();

  public initialize(context: SheetEmbeddedEditorContext): void {
    this.#assertLive();
    if (
      this.#isCommandExecuting &&
      context.isCommandExecuting &&
      context.isCommandExecuting !== this.#isCommandExecuting
    ) {
      throw new SearError('Sheet edit command boundary is already bound to an editor.');
    }
    this.#isCommandExecuting = context.isCommandExecuting ?? this.#isCommandExecuting;
    this.initializeCount += 1;
  }

  public createRenderSession(context: SheetEmbeddedEditorContext): SheetRenderSession {
    this.#assertLive();
    this.renderContexts.push(context);
    const session = new FakeRenderSession(context);
    this.renderSessions.push(session);
    return session;
  }

  public createEditSession(context: SheetEmbeddedEditorContext): SheetEditSession {
    this.#assertLive();
    const isCommandExecuting = this.#isCommandExecuting ?? context.isCommandExecuting;
    if (isCommandExecuting && !isCommandExecuting()) {
      throw new SearError('Sheet edit session creation must run through editor.commands.run(...).');
    }
    this.editContexts.push(context);
    const session = new FakeEditSession(
      { ...context, isCommandExecuting },
      cloneDocument(context.documentAccessor.read()),
      (input) => this.inputs.push(input),
      (document) => this.committedDocuments.push(document),
      () => {
        this.cancelCount += 1;
      },
      this.#sessionOwnerToken,
    );
    this.#editSessions.add(session);
    return session;
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
    for (const session of [...this.#editSessions].reverse()) session.dispose(this.#sessionOwnerToken);
    this.#editSessions.clear();
    this.observations.destroy();
    this.disposeCount += 1;
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('FakeSheetEmbeddedEditor has been disposed.');
  }
}
