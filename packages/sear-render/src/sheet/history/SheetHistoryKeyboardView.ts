import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { RedoSheetCommand, UndoSheetCommand } from '@searsuite/sear-plugin-history';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { KeyboardRouter } from '@searsuite/sear-render-input';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Native shortcut bindings for the independent history command surface. */
@Injectable()
export class SheetHistoryKeyboardView extends ViewExtensionBase<unknown, CellProperties> {
  public static readonly symbol = Symbol.for('SheetHistoryKeyboardView');
  readonly #keyboard: KeyboardRouter;
  readonly #commands: SheetCommandBus;
  #dispose: (() => void) | undefined;

  public constructor(
    @Inject(KeyboardRouter.symbol) keyboard: KeyboardRouter,
    @Inject(SheetCommandBus.symbol) commands: SheetCommandBus,
  ) {
    super(new PluginKey('SheetHistoryKeyboardView'));
    this.#keyboard = keyboard;
    this.#commands = commands;
  }

  public initializeView(): void {
    this.#dispose =
      this.#keyboard.subscribe({
        onUndo: () => this.#commands.run(UndoSheetCommand, undefined),
        onRedo: () => this.#commands.run(RedoSheetCommand, undefined),
      }) || undefined;
  }

  public destroyView(): void {
    this.#dispose?.();
    this.#dispose = undefined;
  }
}
