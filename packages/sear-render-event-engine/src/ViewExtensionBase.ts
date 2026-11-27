import { type StateOwnerKey } from '@searsuite/sear-domain-state';
import { type NodeProperties } from '@searsuite/sear-render-node';
import { SearError } from '@searsuite/sear-foundation-error';
import { type SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { ViewExtensionRole, type ViewExtension } from './ViewExtension';

/** Presentation identity and local lifecycle guards, without document state or reducers. */
export abstract class ViewExtensionBase<Context, Properties extends NodeProperties>
  implements ViewExtension<Context, Properties>
{
  /** Identifies this contribution as presentation rather than a document state owner. */
  public readonly [ViewExtensionRole] = true as const;
  /** Stable identity used to register and dispose this contribution within one editor. */
  public readonly key: StateOwnerKey;
  /** Orders scene contributions; lower values are drawn first. */
  public readonly depth: number = 0;
  /** Enables diagnostics when presentation priorities collide. */
  public readonly warnOnDuplicateDepth: boolean = true;
  #assertWrite: (() => void) | undefined;
  #session: SessionStateRegistry | undefined;

  protected constructor(key: StateOwnerKey) {
    this.key = key;
  }

  /** Installs the editor's authority check for view-local commands and session restoration. */
  public enforceRuntimeWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('View extension write boundary is already installed.');
    this.#assertWrite = assertWrite;
  }

  protected assertRuntimeWriteAllowed(): void {
    this.#assertWrite?.();
  }

  protected hasRuntimeWriteBoundary(): boolean {
    return this.#assertWrite !== undefined;
  }

  protected registerOwnedSessionState(registry: SessionStateRegistry, register: () => void): void {
    if (this.#session && this.#session !== registry)
      throw new SearError('View session is already owned by another editor.');
    register();
    this.#session = registry;
  }

  /** Default display configuration contributions for this view. */
  public registerConfig(): Array<{
    /** Stable identity used to register and dispose this contribution within one editor. */
    key: StateOwnerKey /** Editor-local defaults and configuration contributions. */;
    config: object;
  }> {
    return [];
  }
}
