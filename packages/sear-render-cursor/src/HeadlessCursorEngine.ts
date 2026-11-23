import { Injectable } from '@searsuite/sear-foundation-di';
import { CursorEngine } from './CursorEngine';
import { CursorToken } from './CursorToken';

/** Cursor adapter for environments that have no visible pointer. */
@Injectable()
export class HeadlessCursorEngine extends CursorEngine {
  /** DI token for resolving HeadlessCursorEngine. */
  public static readonly symbol: symbol = Symbol.for('HeadlessCursorEngine');

  /** Attaches this adapter to its host surface. */
  public mount(_target: unknown): void {}
  /** Applies a transaction to HeadlessCursorEngine state. */
  public apply(_token: CursorToken): void {}
  /** Applies a temporary host cursor override. */
  public override(_token: CursorToken | null): void {}
  /** Detaches this adapter from its host surface. */
  public unmount(): void {}
}
