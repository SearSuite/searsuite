import { type SheetFormatPainterOptions } from '../../SheetFormatPainterOptions';
import { createSheetTransaction, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline, runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

import {
  ApplyFormatPainterCommand,
  CancelFormatPainterCommand,
  FormatPainterMode,
  FormatPainterObservation,
  StartFormatPainterCommand,
  type FormatPainterState,
} from '../../FormatPainterProtocol';
import { normalizeFormatPainterRange } from '../../FormatPainterRange';
import { SheetFormatPainterSession } from '../../SheetFormatPainterSession';

/** Owns only a local captured-format session; document formats remain with their owners. */
@Injectable()
export class SheetFormatPainterPlugin extends Plugin<null> {
  readonly #options: SheetFormatPainterOptions;

  public static readonly symbol = Symbol.for('SheetFormatPainterPlugin');
  public readonly warnOnDuplicateDepth = false;
  readonly #session: SheetFormatPainterSession;
  #commands: SheetCommandBus | null = null;
  readonly #listeners = new Set<(state: FormatPainterState) => void>();

  public constructor(options: SheetFormatPainterOptions) {
    super({ key: new PluginKey('SheetFormatPainterPlugin'), state: null });
    this.#options = options;
    this.#session = options.session ?? new SheetFormatPainterSession();
  }

  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet format painter commands are already bound to an editor.');
    }
    this.#commands = commands;
    commands.register(StartFormatPainterCommand, (input) => {
      const source = normalizeFormatPainterRange(input.source, this.#options.readShape());
      const mode = input.mode ?? FormatPainterMode.Once;
      if (!Object.values(FormatPainterMode).includes(mode))
        throw new SearError('Invalid format painter mode.', { mode });
      const snapshot = this.#options.formats.capture(source);
      return new LocalActionCommand(StartFormatPainterCommand.id, () => {
        this.#session.start(this.#options.formats, snapshot, Object.freeze({ mode, source }));
        this.#publish();
      });
    });
    commands.register(
      CancelFormatPainterCommand,
      () => new LocalActionCommand(CancelFormatPainterCommand.id, () => this.#clear()),
    );
    commands.register(ApplyFormatPainterCommand, (input) => {
      const pipeline = new Pipeline(ApplyFormatPainterCommand.id);
      if (this.#session.snapshot && this.#session.state.source) {
        const shape = this.#options.readShape();
        let destination = normalizeFormatPainterRange(input.destination, shape);
        if (destination.start[0] === destination.end[0] && destination.start[1] === destination.end[1]) {
          destination = normalizeFormatPainterRange(
            {
              start: destination.start,
              end: [
                Math.min(
                  shape[0] - 1,
                  destination.start[0] + this.#session.state.source.end[0] - this.#session.state.source.start[0],
                ),
                Math.min(
                  shape[1] - 1,
                  destination.start[1] + this.#session.state.source.end[1] - this.#session.state.source.start[1],
                ),
              ],
            },
            shape,
          );
        }
        const captured = this.#session.snapshot;
        captured.plan(destination, this.#options.formats).forEach((plan) => {
          if (plan.operations.length)
            pipeline.addTransaction(
              'formatPainter.applyOwner',
              createSheetTransaction(plan.target, [...plan.operations]),
            );
        });
        // Complete the local session only after Core has committed and rendered the pipeline.
        if (this.#session.state.mode === FormatPainterMode.Once) pipeline.use({ onComplete: () => this.#clear() });
      }
      return { id: ApplyFormatPainterCommand.id, execute: () => ({ pipeline }) };
    });
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(FormatPainterObservation, {
      getSnapshot: () => this.#session.visibleState(this.#options.formats),
      subscribe: (listener) => {
        this.#listeners.add(listener);
        return () => {
          this.#listeners.delete(listener);
        };
      },
    });
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  public apply(_state: null, _transaction: Transaction): null {
    return null;
  }
  public destroy(): void {
    this.assertRuntimeWriteAllowed();
    if (!this.#options.session) this.#session.clear();
    this.#listeners.clear();
  }

  #clear(): void {
    this.#session.clear();
    this.#publish();
  }
  #publish(): void {
    const state = this.#session.visibleState(this.#options.formats);
    runOutsideCommandExecution(() => {
      [...this.#listeners].forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          this.#options.platform.warn('Format painter listener failed.', error);
        }
      });
    });
  }
}
