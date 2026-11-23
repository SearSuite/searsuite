import { Injectable } from '@searsuite/sear-foundation-di';
import { assertSheetContributionWrite } from '@searsuite/sear-assembly-plugin';
import { type PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';

import { SearRegistryConflictError } from './errors/SearAssemblyError';
import { type PipelineStep } from './Pipeline';

/** Effects an executor may request without taking ownership of frame flushing. */
export interface PipelineStepExecutionContext {
  executeTransaction(step: PipelineStep): void;
  renderPlugin(step: PipelineStep): void;
  applyInteraction(step: PipelineStep): void;
  runLocalAction(step: PipelineStep): void;
  prepareLocalAction?(step: PipelineStep): void;
  schedulePostCommit(step: PipelineStep): void;
  schedulePostRender(step: PipelineStep): void;
  markDirty(rect: PositionRect<HexColor>): void;
}

/** Handles one extensible Pipeline step kind. */
export interface PipelineStepExecutor {
  readonly kind: string;
  execute(context: PipelineStepExecutionContext, step: PipelineStep): void;
}

/**
 * Per-container registry of Pipeline step executors.
 *
 * The sheet core owns frame flushing; executors only perform their local work
 * through PipelineStepExecutionContext. This keeps custom steps extensible
 * without allowing them to bypass dirty-region or render-frame boundaries.
 */
@Injectable()
export class PipelineStepExecutorRegistry {
  /** DI token for resolving PipelineStepExecutorRegistry. */
  public static readonly symbol = Symbol.for('PipelineStepExecutorRegistry');

  readonly #executors = new Map<string, PipelineStepExecutor>();

  /** Registers the value. */
  public register(executor: PipelineStepExecutor): () => void {
    assertSheetContributionWrite(this);
    if (this.#executors.has(executor.kind)) {
      throw new SearRegistryConflictError(
        'pipeline step executor',
        executor.kind,
        `A pipeline step executor for "${executor.kind}" is already registered.`,
      );
    }
    const registered: PipelineStepExecutor = Object.freeze({
      kind: executor.kind,
      execute: executor.execute.bind(executor),
    });
    this.#executors.set(registered.kind, registered);
    const registry = this;
    return function unregisterPipelineStepExecutor(): void {
      assertSheetContributionWrite(registry);
      if (registry.#executors.get(registered.kind) === registered) registry.#executors.delete(registered.kind);
    };
  }

  /** Returns the value. */
  public get(kind: string): PipelineStepExecutor | undefined {
    return this.#executors.get(kind);
  }
}
