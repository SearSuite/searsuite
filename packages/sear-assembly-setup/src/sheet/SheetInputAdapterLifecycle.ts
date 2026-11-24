import { type SheetLifecycleContext, type SheetLifecycleController } from '@searsuite/sear-assembly-core';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';

/** Owns input-adapter listeners for one sheet editor instance. */
@Injectable()
export class SheetInputAdapterLifecycle implements SheetLifecycleController {
  readonly #textInput: TextInput;
  readonly #keyboardRouter: KeyboardRouter;
  readonly #pointerCapture: PointerCapture;

  /** DI token for resolving the sheet input lifecycle owner. */
  public static readonly symbol = Symbol.for('SheetInputAdapterLifecycle');

  /** Creates a sheet input lifecycle owner. */
  public constructor(
    @Inject(TextInput.symbol)
    textInput: TextInput,
    @Inject(KeyboardRouter.symbol)
    keyboardRouter: KeyboardRouter,
    @Inject(PointerCapture.symbol)
    pointerCapture: PointerCapture,
  ) {
    this.#textInput = textInput;
    this.#keyboardRouter = keyboardRouter;
    this.#pointerCapture = pointerCapture;
  }

  /** Grid shortcuts remain active outside cell-edit sessions. */
  public start(_context: SheetLifecycleContext): void {
    this.#keyboardRouter.startListener();
  }

  /** Releases all listeners that may remain active during editor teardown. */
  public destroy(): void {
    this.#textInput.stopListener();
    this.#pointerCapture.stop();
    this.#keyboardRouter.stopListener();
  }
}
