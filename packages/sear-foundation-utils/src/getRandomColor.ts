const ZERO = '0';
const HASH = '#';

/**
 * Hexadecimal color string type (e.g., "#ff0000")
 */
type HexDigit =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F';

/** Type contract for HexColor. */
export type HexColor = `#${string}`;

/** Standard opaque colors shared by renderers and host adapters. */
export const StandardColor = {
  Black: '#000000',
} as const satisfies Record<string, HexColor>;

/**
 * Color pool statistics interface
 */
export interface ColorPoolStats {
  available: number;
  total: number;
  usagePercentage: number;
}

/**
 * Color pool using binary operations for optimal space and time efficiency
 */
class ColorPool {
  // Use Uint32Array to store color usage as bits (32 colors per element)
  #used: Uint32Array;
  #availableCount: number;
  readonly #maxColors = 0xffffff + 1; // 16,777,216 colors
  readonly #bitsPerElement = 32;
  readonly #arraySize: number;

  /** Creates a ColorPool instance. */
  constructor() {
    // Calculate array size needed to store all possible colors as bits
    this.#arraySize = Math.ceil(this.#maxColors / this.#bitsPerElement);
    this.#used = new Uint32Array(this.#arraySize);
    this.#availableCount = this.#maxColors;
  }

  /**
   * Generate random unused color
   */
  getRandomColor(): HexColor | null {
    if (this.#availableCount === 0) {
      return null; // All colors used
    }

    let color: number;
    let arrayIndex: number;
    let bitIndex: number;

    // Find unused color using random sampling
    do {
      color = Math.floor(Math.random() * this.#maxColors);
      arrayIndex = Math.floor(color / this.#bitsPerElement);
      bitIndex = color % this.#bitsPerElement;
    } while (this.#used[arrayIndex] & (1 << bitIndex));

    // Mark color as used
    this.#used[arrayIndex] |= 1 << bitIndex;
    this.#availableCount--;

    // Convert to hex string
    let hexColor = color.toString(16).padStart(6, ZERO);
    return (HASH + hexColor) as HexColor;
  }

  /**
   * Release a color back to the pool
   */
  releaseColor(hexColor: HexColor): boolean {
    const colorStr = hexColor.replace(HASH, '');
    const color = parseInt(colorStr, 16);

    if (color < 0 || color >= this.#maxColors) {
      return false;
    }

    const arrayIndex = Math.floor(color / this.#bitsPerElement);
    const bitIndex = color % this.#bitsPerElement;
    const mask = 1 << bitIndex;

    // Check if color is actually used
    if (!(this.#used[arrayIndex] & mask)) {
      return false; // Color wasn't used
    }

    // Release color
    this.#used[arrayIndex] &= ~mask;
    this.#availableCount++;
    return true;
  }

  /**
   * Reset all colors to unused state
   */
  reset(): void {
    this.#used.fill(0);
    this.#availableCount = this.#maxColors;
  }

  /**
   * Get number of available colors
   */
  getAvailableCount(): number {
    return this.#availableCount;
  }

  /**
   * Get usage percentage
   */
  getUsagePercentage(): number {
    return ((this.#maxColors - this.#availableCount) / this.#maxColors) * 100;
  }
}

// Global color pool instance
const colorPool = new ColorPool();

/**
 * Generates a random color in hexadecimal format.
 * Ensures no duplicate colors until all colors are exhausted.
 * @returns A random hexadecimal color string, or null if all colors used.
 */
export function getRandomColor(): HexColor | null {
  return colorPool.getRandomColor();
}

/**
 * Release a color back to the available pool
 */
export function releaseColor(color: HexColor): boolean {
  return colorPool.releaseColor(color);
}

/**
 * Reset color pool to allow all colors again
 */
export function resetColorPool(): void {
  colorPool.reset();
}

/**
 * Get statistics about color pool usage
 */
export function getColorPoolStats(): ColorPoolStats {
  return {
    available: colorPool.getAvailableCount(),
    total: 0xffffff + 1,
    usagePercentage: colorPool.getUsagePercentage(),
  };
}
