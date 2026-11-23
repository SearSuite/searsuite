import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

/** Shared caret blink state used by document feature plugins and render layout. */
@Injectable()
export class DocCaretState {
  /** DI token for resolving caret state owned by CaretPlugin. */
  public static readonly symbol = Symbol.for('DocCaretState');

  #visible = true;
  #isCommandExecuting: (() => boolean) | null = null;

  /** Closes direct caret writes after editor assembly. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Doc caret command boundary is already installed.');
    this.#isCommandExecuting = isCommandExecuting;
    Object.freeze(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Doc caret changes must run through editor.commands.run(...).');
    }
  }

  /** Returns whether the caret should be painted in the current frame. */
  public isVisible(): boolean {
    return this.#visible;
  }

  /** Sets the current caret visibility. */
  public setVisible(visible: boolean): void {
    this.#assertCommandWrite();
    this.#visible = visible;
  }

  /** Restarts the blink cycle with the caret visible. */
  public reset(): void {
    this.#assertCommandWrite();
    this.#visible = true;
  }

  /** Toggles the caret visibility for a blink tick. */
  public toggle(): boolean {
    this.#assertCommandWrite();
    this.#visible = !this.#visible;
    return this.#visible;
  }
}
