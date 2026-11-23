import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { SearError } from '@searsuite/sear-foundation-error';

import { DocInputBindingRegistry } from './DocInputBindingRegistry';

/** Owns standalone document text-input and keyboard adapter subscriptions. */
@Injectable()
export class DocInputAdapterLifecycle {
  /** DI token for resolving the document input adapter lifecycle. */
  public static readonly symbol = Symbol.for('DocInputAdapterLifecycle');

  private started = false;
  private destroyed = false;
  #assertCommandWrite: (() => void) | undefined;
  #teardownToken: object | undefined;

  /** Closes input lifecycle changes once the editor has started. */
  public enforceLifecycleBoundary(assertCommandWrite: () => void, teardownToken: object): void {
    if (this.#assertCommandWrite) throw new SearError('Doc input lifecycle boundary is already installed.');
    this.#assertCommandWrite = assertCommandWrite;
    this.#teardownToken = teardownToken;
  }

  /** Creates an input adapter lifecycle owner. */
  public constructor(
    @Inject(TextInput.symbol)
    private readonly textInput: TextInput,
    @Inject(KeyboardRouter.symbol)
    private readonly keyboardRouter: KeyboardRouter,
    @Inject(PointerCapture.symbol)
    private readonly pointerCapture: PointerCapture,
    @Inject(DocInputBindingRegistry.symbol)
    private readonly inputBindings: DocInputBindingRegistry,
  ) {}

  /** Starts text and keyboard adapter subscriptions/listeners. */
  public start(): void {
    if (this.destroyed) throw new SearError('Doc input lifecycle has been destroyed.');
    if (this.started) return;
    this.#assertCommandWrite?.();
    this.started = true;
    this.textInput.subscribe(this.inputBindings.createTextHandlers());
    this.keyboardRouter.subscribe(this.inputBindings.createKeyboardHandlers());
    this.textInput.startListener();
    this.keyboardRouter.startListener();
  }

  /** Releases input adapter listeners and binding state. */
  public destroy(teardownToken?: object): void {
    if (this.destroyed) return;
    if (this.#teardownToken && teardownToken !== this.#teardownToken) {
      throw new SearError('Doc input lifecycle cleanup requires its editor owner.');
    }
    this.destroyed = true;
    if (!this.started) return;
    this.started = false;
    this.textInput.stopListener();
    this.pointerCapture.stop();
    this.keyboardRouter.stopListener();
    this.inputBindings.clear();
  }
}
