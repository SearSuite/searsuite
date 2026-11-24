import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type KeyboardRouterHandlers, type TextInputEvent, type TextInputHandlers } from '@searsuite/sear-render-input';

/** Registry that lets multiple document plugins contribute handlers to single-subscription input adapters. */
@Injectable()
export class DocInputBindingRegistry {
  /** DI token for resolving the input binding registry. */
  public static readonly symbol = Symbol.for('DocInputBindingRegistry');

  readonly #textHandlers = new Set<TextInputHandlers>();
  readonly #keyboardHandlers = new Set<KeyboardRouterHandlers>();
  #isCommandExecuting: (() => boolean) | null = null;
  #isTearingDown: (() => boolean) | null = null;
  #destroyed = false;

  /** Closes registration changes after editor startup. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean, isTearingDown: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Doc input binding command boundary is already installed.');
    this.#isCommandExecuting = isCommandExecuting;
    this.#isTearingDown = isTearingDown;
    Object.freeze(this);
  }

  #assertWritable(allowTeardown = false): void {
    if (this.#destroyed) throw new SearError('Doc input bindings have been destroyed.');
    if (this.#isCommandExecuting && !this.#isCommandExecuting() &&
      !(allowTeardown && this.#isTearingDown?.())) {
      throw new SearError('Doc input bindings must change through editor.commands.run(...).');
    }
  }

  /** Adds text-input handlers and returns a disposer. */
  public registerTextHandlers(handlers: TextInputHandlers): () => void {
    this.#assertWritable();
    const registered = Object.freeze({ ...handlers });
    this.#textHandlers.add(registered);
    return this.#unregisterTextHandlers.bind(this, registered);
  }

  /** Adds keyboard-action handlers and returns a disposer. */
  public registerKeyboardHandlers(handlers: KeyboardRouterHandlers): () => void {
    this.#assertWritable();
    const registered = Object.freeze({ ...handlers });
    this.#keyboardHandlers.add(registered);
    return this.#unregisterKeyboardHandlers.bind(this, registered);
  }

  /** Creates the composed text handlers passed to the host text adapter. */
  public createTextHandlers(): TextInputHandlers {
    return {
      onTextInput: this.#dispatchTextInput.bind(this),
      onDelete: this.#dispatchTextDelete.bind(this),
    };
  }

  /** Creates the composed keyboard handlers passed to the host keyboard adapter. */
  public createKeyboardHandlers(): KeyboardRouterHandlers {
    return {
      onDelete: this.#dispatchKeyboardDelete.bind(this),
      onEnter: this.#dispatchKeyboardEnter.bind(this),
      onEscape: this.#dispatchKeyboardEscape.bind(this),
      onArrowLeft: this.#dispatchKeyboardArrowLeft.bind(this),
      onArrowRight: this.#dispatchKeyboardArrowRight.bind(this),
      onArrowUp: this.#dispatchKeyboardArrowUp.bind(this),
      onArrowDown: this.#dispatchKeyboardArrowDown.bind(this),
      onSelectAll: this.#dispatchKeyboardSelectAll.bind(this),
      onToggleBold: this.#dispatchKeyboardToggleBold.bind(this),
      onToggleItalic: this.#dispatchKeyboardToggleItalic.bind(this),
      onToggleUnderline: this.#dispatchKeyboardToggleUnderline.bind(this),
      onToggleStrikethrough: this.#dispatchKeyboardToggleStrikethrough.bind(this),
      onSoftEnter: this.#dispatchKeyboardSoftEnter.bind(this),
      onZoomIn: this.#dispatchKeyboardZoomIn.bind(this),
      onZoomOut: this.#dispatchKeyboardZoomOut.bind(this),
      onZoomReset: this.#dispatchKeyboardZoomReset.bind(this),
      onUndo: this.#dispatchKeyboardUndo.bind(this),
      onRedo: this.#dispatchKeyboardRedo.bind(this),
    };
  }

  /** Removes every registered handler. */
  public clear(): void {
    this.#assertWritable(true);
    this.#textHandlers.clear();
    this.#keyboardHandlers.clear();
    this.#destroyed = true;
  }

  #unregisterTextHandlers(handlers: TextInputHandlers): void {
    if (!this.#textHandlers.has(handlers)) return;
    this.#assertWritable(true);
    this.#textHandlers.delete(handlers);
  }

  #unregisterKeyboardHandlers(handlers: KeyboardRouterHandlers): void {
    if (!this.#keyboardHandlers.has(handlers)) return;
    this.#assertWritable(true);
    this.#keyboardHandlers.delete(handlers);
  }

  #dispatchTextInput(event: TextInputEvent): void {
    for (const handler of this.#textHandlers) handler.onTextInput?.(event);
  }

  #dispatchTextDelete(): void {
    for (const handler of this.#textHandlers) handler.onDelete?.();
  }

  #dispatchKeyboardDelete(): void {
    for (const handler of this.#keyboardHandlers) handler.onDelete?.();
  }

  #dispatchKeyboardEnter(): void {
    for (const handler of this.#keyboardHandlers) handler.onEnter?.(false);
  }

  #dispatchKeyboardEscape(): void {
    for (const handler of this.#keyboardHandlers) handler.onEscape?.();
  }

  #dispatchKeyboardArrowLeft(shiftKey: boolean, metaKey: boolean): void {
    for (const handler of this.#keyboardHandlers) handler.onArrowLeft?.(shiftKey, metaKey);
  }

  #dispatchKeyboardArrowRight(shiftKey: boolean, metaKey: boolean): void {
    for (const handler of this.#keyboardHandlers) handler.onArrowRight?.(shiftKey, metaKey);
  }

  #dispatchKeyboardArrowUp(shiftKey: boolean, metaKey: boolean): void {
    for (const handler of this.#keyboardHandlers) handler.onArrowUp?.(shiftKey, metaKey);
  }

  #dispatchKeyboardArrowDown(shiftKey: boolean, metaKey: boolean): void {
    for (const handler of this.#keyboardHandlers) handler.onArrowDown?.(shiftKey, metaKey);
  }

  #dispatchKeyboardSelectAll(): void {
    for (const handler of this.#keyboardHandlers) handler.onSelectAll?.();
  }

  #dispatchKeyboardToggleBold(): void {
    for (const handler of this.#keyboardHandlers) handler.onToggleBold?.();
  }

  #dispatchKeyboardToggleItalic(): void {
    for (const handler of this.#keyboardHandlers) handler.onToggleItalic?.();
  }

  #dispatchKeyboardToggleUnderline(): void {
    for (const handler of this.#keyboardHandlers) handler.onToggleUnderline?.();
  }

  #dispatchKeyboardToggleStrikethrough(): void {
    for (const handler of this.#keyboardHandlers) handler.onToggleStrikethrough?.();
  }

  #dispatchKeyboardSoftEnter(): void {
    for (const handler of this.#keyboardHandlers) handler.onSoftEnter?.();
  }

  #dispatchKeyboardZoomIn(): void {
    for (const handler of this.#keyboardHandlers) handler.onZoomIn?.();
  }

  #dispatchKeyboardZoomOut(): void {
    for (const handler of this.#keyboardHandlers) handler.onZoomOut?.();
  }

  #dispatchKeyboardZoomReset(): void {
    for (const handler of this.#keyboardHandlers) handler.onZoomReset?.();
  }

  #dispatchKeyboardUndo(): void {
    for (const handler of this.#keyboardHandlers) handler.onUndo?.();
  }

  #dispatchKeyboardRedo(): void {
    for (const handler of this.#keyboardHandlers) handler.onRedo?.();
  }
}
