import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { CellCommitStrategyDefinition, CellCommitContext } from './CellCommitStrategy';
import { type CellMatrixElement } from './CellMatrixElement';
import { type CellFormat } from './CellFormat';
import { assertCellExtensionWrite } from './CellExtensionWriteBoundary';

/**
 * Extensible value-type registry. Hosts and plugins can add or replace input
 * classifiers without coupling their domain types to the cell editor.
 */
@Injectable()
export class CellCommitStrategyRegistry {
  /** DI token for resolving CellCommitStrategyRegistry. */
  public static readonly symbol = Symbol.for('CellCommitStrategyRegistry');

  readonly #strategies = new Map<string, CellCommitStrategyDefinition>();

  /**
   * Registers or replaces a strategy. The returned disposer restores the
   * replaced strategy when this registration remains active.
   */
  register(strategy: CellCommitStrategyDefinition): () => void {
    assertCellExtensionWrite(this);
    const registered: CellCommitStrategyDefinition = Object.freeze({
      key: strategy.key,
      priority: strategy.priority,
      matches: strategy.matches.bind(strategy),
      commit: strategy.commit.bind(strategy),
      ...(strategy.inferFormat ? { inferFormat: strategy.inferFormat.bind(strategy) } : {}),
    });
    const previous = this.#strategies.get(registered.key);
    this.#strategies.set(registered.key, registered);
    const registry = this;
    return function unregisterCellCommitStrategy(): void {
      assertCellExtensionWrite(registry);
      if (registry.get(registered.key) !== registered) return;
      if (previous) registry.#strategies.set(registered.key, previous);
      else registry.#strategies.delete(registered.key);
    };
  }

  /** Unregisters the value. */
  unregister(key: string): boolean {
    assertCellExtensionWrite(this);
    return this.#strategies.delete(key);
  }

  /** Returns the value. */
  get(key: string): CellCommitStrategyDefinition | undefined {
    return this.#strategies.get(key);
  }

  /** Returns the all. */
  getAll(): readonly CellCommitStrategyDefinition[] {
    return [...this.#strategies.values()];
  }

  /** Selects a matching strategy and commits the supplied edit input. */
  commit(context: CellCommitContext): CellMatrixElement | null {
    return this.commitWithFormat(context).cell;
  }

  /** Commits a value and returns any format inferred by its owning strategy. */
  commitWithFormat(context: CellCommitContext): { cell: CellMatrixElement | null; format: CellFormat | null } {
    const strategy = [...this.#strategies.values()]
      .filter((candidate) => candidate.matches(context))
      .sort((left, right) => right.priority - left.priority)[0];
    if (!strategy) throw new SearError('No cell commit strategy matched the editor input.');
    return { cell: strategy.commit(context), format: strategy.inferFormat?.(context) ?? null };
  }
}
