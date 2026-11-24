import { SearError } from '@searsuite/sear-foundation-error';
import { columnIndexToLabel, columnLabelToIndex } from '@searsuite/sear-foundation-utils';

// Decorator pattern is preferred

/**
 * Parses and represents an Excel-style rectangular range.
 *
 * The public coordinates are one-based because the string format is A1-based,
 * while column conversion delegates to the shared zero-based label utilities.
 */
export class Range {
  /** One-based starting column index. */
  #startColumn: number;
  /** One-based starting row index. */
  #startRow: number;
  /** One-based ending column index. */
  #endColumn: number;
  /** One-based ending row index. */
  #endRow: number;

  /**
   * Constructs a range from an A1-style string.
   * @param range - Range string in the form A1:B2.
   */
  constructor(range: string) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) {
      throw new SearError("Invalid range format. Expected format 'A1:B2'.");
    }

    this.#startColumn = Range.columnToNumber(match[1]);
    this.#startRow = parseInt(match[2], 10);
    this.#endColumn = Range.columnToNumber(match[3]);
    this.#endRow = parseInt(match[4], 10);

    if (!this.#isValidRange()) {
      throw new SearError('Invalid range: Start must be less than or equal to end.');
    }
  }

  /**
   * Converts an Excel-style column label to a one-based column number.
   * @param column - Column label such as A or AA.
   * @returns One-based column number.
   */
  public static columnToNumber(column: string): number {
    return columnLabelToIndex(column) + 1;
  }

  /**
   * Converts a one-based column number to an Excel-style label.
   * @param number - One-based column number.
   * @returns Column label such as A or AA.
   */
  public static numberToColumn(number: number): string {
    return columnIndexToLabel(number - 1);
  }

  /** Returns whether the start coordinate is before or equal to the end coordinate. */
  #isValidRange(): boolean {
    return this.#startColumn <= this.#endColumn && this.#startRow <= this.#endRow;
  }

  /** Range coordinates as [[startColumn, startRow], [endColumn, endRow]]. */
  public get range(): [[number, number], [number, number]] {
    return [
      [this.#startColumn, this.#startRow],
      [this.#endColumn, this.#endRow],
    ];
  }

  /** Range dimensions as [width, height]. */
  public get shape(): [number, number] {
    const width = this.#endColumn - this.#startColumn + 1;
    const height = this.#endRow - this.#startRow + 1;
    return [width, height];
  }

  /** Serializes the range back to A1 notation. */
  public toString(): string {
    return `${Range.numberToColumn(this.#startColumn)}${this.#startRow}:${Range.numberToColumn(this.#endColumn)}${
      this.#endRow
    }`;
  }

  /**
   * Tests whether a one-based coordinate is inside this range.
   * @param x - One-based column coordinate.
   * @param y - One-based row coordinate.
   * @returns True when the coordinate falls inside the range.
   */
  public contains(x: number, y: number): boolean {
    return x >= this.#startColumn && x <= this.#endColumn && y >= this.#startRow && y <= this.#endRow;
  }
}
