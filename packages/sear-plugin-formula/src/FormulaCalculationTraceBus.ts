import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { runOutsideCommandExecution } from '@searsuite/sear-assembly-core';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SearError } from '@searsuite/sear-foundation-error';
import {
  type FormulaCalculationTraceEvent,
  type FormulaCalculationTraceEventPayload,
  type FormulaCalculationTraceListener,
  type IFormulaCalculationTraceProvider,
} from '@searsuite/sear-domain-formula-engine';

/**
 * Editor-local formula trace event hub.
 *
 * The hub fans out local runtime trace to host/plugin subscribers. It is
 * intentionally independent from OT, rendering, and persistence; publishing an
 * event must not mutate sheet state or request a render pipeline.
 */
@Injectable()
export class FormulaCalculationTraceBus implements IFormulaCalculationTraceProvider {
  /** DI token for resolving FormulaCalculationTraceBus. */
  public static readonly symbol = Symbol.for('FormulaCalculationTraceBus');

  #sequence = 0;
  #isCommandExecuting: (() => boolean) | undefined;
  readonly #listeners = new Set<FormulaCalculationTraceListener>();

  /** Creates a trace hub bound to one editor instance. */
  constructor(@Inject(Platform.symbol) private readonly platform: Platform) {}

  /** Seals event publication after initial formula data has been scanned. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Formula calculation trace is already bound to an editor.');
    this.#isCommandExecuting = isCommandExecuting;
  }

  /** @inheritdoc */
  public subscribeFormulaCalculationTrace(listener: FormulaCalculationTraceListener): () => void {
    this.#listeners.add(listener);
    const bus = this;
    return function unsubscribeFormulaCalculationTrace(): void {
      bus.#listeners.delete(listener);
    };
  }

  /**
   * Emits one calculation trace event to current subscribers.
   *
   * Listener failures are reported through Platform.warn and do not interrupt
   * formula recalculation, dependency maintenance, rendering invalidation, or
   * other subscribers.
   *
   * @param event - Event payload without provider-owned sequence metadata.
   */
  public emit(event: FormulaCalculationTraceEventPayload): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula calculation trace must change through editor.commands.run(...).');
    }
    const nextEvent = { ...event, sequence: ++this.#sequence } as FormulaCalculationTraceEvent;
    runOutsideCommandExecution(() => {
      this.#listeners.forEach((listener) => {
        try {
          listener(nextEvent);
        } catch (error) {
          this.platform.warn('[Formula] Calculation trace listener failed.', error);
        }
      });
    });
  }
}
