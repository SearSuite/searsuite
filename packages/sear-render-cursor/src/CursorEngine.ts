import { CursorToken } from './CursorToken';

/**
 * Abstract cursor presentation layer.
 *
 * Responsibilities: translate a logical CursorToken into a concrete presentation
 * (CSS cursor, Canvas sprite, Electron native cursor, test stub, …).
 * Fully decoupled from the Plugin system and the rule system.
 *
 * Contract:
 * - mount()   called once during plugin initialization, receives the render target.
 * - apply()   called on every cursor change; implementations must be idempotent.
 * - unmount() called during plugin destruction; must clean up all side-effects.
 */
export abstract class CursorEngine {
  /** DI token for resolving CursorEngine. */
  public static readonly symbol: symbol = Symbol.for('CursorEngine');

  /** Attaches this adapter to its host surface. */
  abstract mount(target: unknown): void;
  /** Applies a transaction to CursorEngine state. */
  abstract apply(token: CursorToken): void;
  /** Lock the cursor to a fixed token (e.g. during cell editing). Pass null to release. */
  abstract override(token: CursorToken | null): void;
  /** Detaches this adapter from its host surface. */
  abstract unmount(): void;
}
