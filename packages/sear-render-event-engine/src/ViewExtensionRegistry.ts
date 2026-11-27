import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type StateOwnerKey } from '@searsuite/sear-domain-state';
import { type NodeProperties } from '@searsuite/sear-render-node';
import { type ViewExtension } from './ViewExtension';
import { ViewExtensionRole } from './ViewExtension';
import { assertSheetContributionWrite } from '@searsuite/sear-assembly-plugin';

/** Editor-local presentation registrations, independent of state-owner registration. */
@Injectable()
export class ViewExtensionRegistry<Context, Properties extends NodeProperties> {
  public static readonly symbol = Symbol.for('ViewExtensionRegistry');
  readonly #extensions = new Map<string, ViewExtension<Context, Properties>>();
  readonly #removalListeners = new Set<(extension: ViewExtension<Context, Properties>) => void>();

  /** Registers one presentation and returns its owned disposer. */
  public register(extension: ViewExtension<Context, Properties>): () => void {
    assertSheetContributionWrite(this);
    if (extension[ViewExtensionRole] !== true)
      throw new SearError('Presentation registration requires a view extension.');
    const key = extension.key.key;
    if (this.#extensions.has(key)) throw new SearError(`View extension ${key} is already registered.`);
    this.#extensions.set(key, extension);
    return () => {
      assertSheetContributionWrite(this);
      if (this.#extensions.get(key) !== extension) return;
      this.unregister(extension.key);
    };
  }

  /** Resolves a view identity without accessing a state plugin. */
  public get(key: StateOwnerKey): ViewExtension<Context, Properties> | undefined {
    return this.#extensions.get(key.key);
  }

  /** Removes one view together with its owned listeners and retained scene output. */
  public unregister(key: StateOwnerKey): void {
    assertSheetContributionWrite(this);
    const extension = this.#extensions.get(key.key);
    if (!extension) return;
    this.#extensions.delete(key.key);
    try {
      extension.destroyView?.();
    } finally {
      for (const listener of this.#removalListeners) listener(extension);
    }
  }

  /** Lists presentation contributions without exposing business state owners. */
  public getAll(): readonly ViewExtension<Context, Properties>[] {
    return [...this.#extensions.values()];
  }

  /** Lets a scene consumer release retained nodes and input bindings on removal. */
  public subscribeRemovals(listener: (extension: ViewExtension<Context, Properties>) => void): () => void {
    this.#removalListeners.add(listener);
    return () => {
      this.#removalListeners.delete(listener);
    };
  }

  /** Visits view extensions in drawing order. */
  public forEach(visit: (extension: ViewExtension<Context, Properties>) => void): void {
    [...this.#extensions.values()].sort((left, right) => (left.depth ?? 0) - (right.depth ?? 0)).forEach(visit);
  }

  /** Dispatch order follows registration so input controllers can consume events before selection. */
  public forEachInput(visit: (extension: ViewExtension<Context, Properties>) => void): void {
    this.#extensions.forEach(visit);
  }

  /** Releases every presentation, including listeners and renderer registrations. */
  public destroy(): void {
    assertSheetContributionWrite(this);
    const extensions = [...this.#extensions.values()].reverse();
    this.#extensions.clear();
    const errors: unknown[] = [];
    for (const extension of extensions) {
      try {
        extension.destroyView?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'View extension cleanup failed.');
  }
}
