import { Injectable } from '@searsuite/sear-foundation-di';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { Inject } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

/** Layout contribution from an in-flight IME composition. */
export interface DocCompositionLayout {
  /** Whether there is active composing text to render. */
  readonly active: boolean;
  /** Current in-flight composing text. */
  readonly text: string;
  /** Full composing text width in pixels. */
  readonly textWidth: number;
  /** Pixel offset from the composing-text start to the IME caret. */
  readonly caretPixelOffset: number;
}

/** Provider used by layout code to account for optional IME composition. */
export interface DocCompositionProvider {
  /** Measures the active composing text against the current render font. */
  measure(font: string): DocCompositionLayout;
}

/** Owns optional IME composition state independently from cursor and selection state. */
@Injectable()
export class DocCompositionManager implements DocCompositionProvider {
  readonly #textShaper: TextShaper;

  /** DI token for resolving DocCompositionManager. */
  public static readonly symbol: symbol = Symbol.for('DocCompositionManager');

  #text = '';
  #caretOffset = 0;
  #caretPixelOffset = 0;
  #isCommandExecuting: (() => boolean) | null = null;
  #teardownToken: object | null = null;

  public constructor(@Inject(TextShaper.symbol) textShaper: TextShaper) {
    this.#textShaper = textShaper;
  }

  /** Closes direct composition writes after editor assembly. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean, teardownToken?: object): void {
    if (this.#isCommandExecuting) throw new SearError('Doc composition command boundary is already installed.');
    this.#isCommandExecuting = isCommandExecuting;
    this.#teardownToken = teardownToken ?? null;
    Object.freeze(this);
  }

  #assertCommandWrite(teardownToken?: object): void {
    if (this.#isCommandExecuting && (!this.#teardownToken || teardownToken !== this.#teardownToken) &&
      !this.#isCommandExecuting()) {
      throw new SearError('Doc composition changes must run through editor.commands.run(...).');
    }
  }

  /** Updates the active composing text and logical caret offset. */
  public setText(text: string, caretOffset: number = text.length): void {
    this.#assertCommandWrite();
    this.#text = text;
    this.#caretOffset = caretOffset;
  }

  /** Returns the current composing text. */
  public getText(): string {
    return this.#text;
  }

  /** Returns the logical caret offset inside the composing text. */
  public getCaretOffset(): number {
    return this.#caretOffset;
  }

  /** Returns the latest measured caret pixel offset. */
  public getCaretPixelOffset(): number {
    return this.#caretPixelOffset;
  }

  /** Measures current composing text and records the caret pixel offset for rendering. */
  public measure(font: string = '16px sans-serif'): DocCompositionLayout {
    if (!this.#text) {
      this.#caretPixelOffset = 0;
      return { active: false, text: '', textWidth: 0, caretPixelOffset: 0 };
    }
    const shaped = this.#textShaper.shape({ text: this.#text, font });
    const textWidth = shaped.width;
    const caretPixelOffset = shaped.caretStops.find((stop) => stop.textOffset === this.#caretOffset)?.x ?? 0;
    this.#caretPixelOffset = caretPixelOffset;
    return { active: true, text: this.#text, textWidth, caretPixelOffset };
  }

  /** Clears all composing state. */
  public clear(teardownToken?: object): void {
    this.#assertCommandWrite(teardownToken);
    this.#text = '';
    this.#caretOffset = 0;
    this.#caretPixelOffset = 0;
  }
}
