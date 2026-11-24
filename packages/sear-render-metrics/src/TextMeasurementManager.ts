import { TextShaper } from './TextShaper';
import { type TextShapeResult } from './TextShaperTypes';

/** Owns reusable semantic text measurements for one editor runtime. */
export class TextMeasurementManager {
  readonly #textShaper: TextShaper;

  /** DI token for resolving the editor-local text measurement manager. */
  public static readonly symbol = Symbol.for('TextMeasurementManager');

  readonly #spaces = new Map<string, TextShapeResult>();

  public constructor(textShaper: TextShaper) {
    this.#textShaper = textShaper;
  }

  /** Measures one space for a font and reuses the editor-local result. */
  public measureSpace(font: string): TextShapeResult {
    const cached = this.#spaces.get(font);
    if (cached) return cached;
    const measurement = this.#textShaper.shape({ text: ' ', font });
    this.#spaces.set(font, measurement);
    return measurement;
  }

  /** Clears semantic measurements without taking ownership of the text shaper. */
  public clear(): void {
    this.#spaces.clear();
  }
}
