import type { SheetRenderSession } from '@searsuite/sear-sheet-editor-contract';
import type { SheetEmbeddedEditorContext, SheetDocument } from '@searsuite/sear-sheet-editor-contract';
import { SearCoreEditorRuntime } from './SearCoreEditorRuntime';
import { SearCoreRenderSession } from './SearCoreRenderSession';

/** Owns all static cell render sessions for one adapter lifetime. */
export class SearCoreRenderSessionManager {
  readonly #runtime: SearCoreEditorRuntime;

  readonly #sessions = new Set<SearCoreRenderSession>();

  public constructor(runtime: SearCoreEditorRuntime) {
    this.#runtime = runtime;
  }

  public create(context: SheetEmbeddedEditorContext, document: SheetDocument): SheetRenderSession {
    let session: SearCoreRenderSession;
    session = new SearCoreRenderSession(this.#runtime, context, document, () => this.#sessions.delete(session));
    this.#sessions.add(session);
    return session;
  }

  public dispose(): void {
    for (const session of [...this.#sessions].reverse()) session.dispose();
    this.#sessions.clear();
  }
}
