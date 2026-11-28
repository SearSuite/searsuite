import { assertSheetContributionWrite } from '@searsuite/sear-assembly-plugin';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type DocCommandEffect } from './DocEditorCommandTypes';

/** Optional consumers of command effects; a state-only host need not install a view. */
@Injectable()
export class DocCommandEffectRegistry {
  public static readonly symbol = Symbol.for('DocCommandEffectRegistry');
  readonly #platform: Platform;
  readonly #listeners = new Map<DocCommandEffect['type'], Set<(effect: DocCommandEffect) => void>>();

  public constructor(@Inject(Platform.symbol) platform: Platform) {
    this.#platform = platform;
  }

  public register<Kind extends DocCommandEffect['type']>(
    kind: Kind,
    handle: (effect: Extract<DocCommandEffect, { type: Kind }>) => void,
  ): () => void {
    assertSheetContributionWrite(this);
    const listener = (effect: DocCommandEffect) => handle(effect as Extract<DocCommandEffect, { type: Kind }>);
    const listeners = this.#listeners.get(kind) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(kind, listeners);
    return () => {
      assertSheetContributionWrite(this);
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(kind);
    };
  }

  /** Delivers host effects after commit; consumer failures cannot undo committed state. */
  public dispatch(effect: DocCommandEffect): void {
    for (const handle of this.#listeners.get(effect.type) ?? []) {
      try {
        handle(effect);
      } catch (error) {
        this.#platform.warn('Doc command effect consumer failed.', error);
      }
    }
  }

  public destroy(): void {
    assertSheetContributionWrite(this);
    this.#listeners.clear();
  }
}
