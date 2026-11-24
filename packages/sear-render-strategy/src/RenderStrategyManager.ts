import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { RenderStrategy } from './RenderStrategy';
import { NodeProperties } from '@searsuite/sear-render-node';
import { RenderContext } from '@searsuite/sear-render-context';

/**
 * Registry and lookup manager for render strategies.
 *
 * The render engine uses this manager to compose a strategy pipeline by name.
 * Names can be string keys or symbols to avoid collisions in plugin scenarios.
 *
 * @template NodeTypeProperties Node property shape used by all strategies.
 */
@Injectable()
export class RenderStrategyManager<NodeTypeProperties extends NodeProperties> {
  /** DI token for resolving RenderStrategyManager. */
  public static readonly symbol: symbol = Symbol.for('RenderStrategyManager');

  /** Insertion-ordered strategy registry. */
  #strategies = new Map<string | Symbol, RenderStrategy<NodeTypeProperties>>();
  #isCommandExecuting: (() => boolean) | null = null;

  /** Closes direct strategy and view-scale changes after Sheet startup. */
  public enforceCommandBoundary(isExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Render strategy manager is already bound to an editor.');
    this.#isCommandExecuting = isExecuting;
    Object.freeze(this);
  }

  #assertWritable(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Render strategy changes must run through editor.commands.run(...).');
    }
  }

  /**
   * Registers or replaces a strategy under the provided key.
   */
  addStrategy(name: string | Symbol, strategy: RenderStrategy<NodeTypeProperties>): void {
    this.#assertWritable();
    this.#strategies.set(name, strategy);
  }

  /** Inserts a strategy immediately before an existing strategy. */
  addStrategyBefore(
    reference: string | Symbol,
    name: string | Symbol,
    strategy: RenderStrategy<NodeTypeProperties>,
  ): void {
    this.#insertStrategy(reference, name, strategy, 'before');
  }

  /** Inserts a strategy immediately after an existing strategy. */
  addStrategyAfter(
    reference: string | Symbol,
    name: string | Symbol,
    strategy: RenderStrategy<NodeTypeProperties>,
  ): void {
    this.#insertStrategy(reference, name, strategy, 'after');
  }

  #insertStrategy(
    reference: string | Symbol,
    name: string | Symbol,
    strategy: RenderStrategy<NodeTypeProperties>,
    position: 'before' | 'after',
  ): void {
    this.#assertWritable();
    if (!this.#strategies.has(reference)) {
      throw new SearError(`Render strategy ${String(reference)} is not registered`);
    }
    const entries = Array.from(this.#strategies.entries()).filter(([key]) => key !== name);
    const next = new Map<string | Symbol, RenderStrategy<NodeTypeProperties>>();
    for (const [key, value] of entries) {
      if (position === 'before' && key === reference) next.set(name, strategy);
      next.set(key, value);
      if (position === 'after' && key === reference) next.set(name, strategy);
    }
    this.#strategies = next;
  }

  /**
   * Retrieves a strategy by key.
   */
  getStrategy(name: string | Symbol): RenderStrategy<NodeTypeProperties> | undefined {
    return this.#strategies.get(name);
  }

  /**
   * Returns all currently registered strategies in insertion order.
   */
  getAllStrategy(): RenderStrategy<NodeTypeProperties>[] {
    return Array.from(this.#strategies.values());
  }

  /**
   * Propagates view scale to every context contributed by registered
   * strategies. Shared base/off-screen/hit contexts are updated once.
   */
  setViewScale(scale: number): void {
    this.#assertWritable();
    const contexts = new Set<RenderContext>();
    for (const strategy of this.#strategies.values()) {
      for (const context of strategy.getViewScaleContexts()) contexts.add(context);
    }
    for (const context of contexts) context.setViewScale(scale);
  }
}
