import { Injectable } from '@searsuite/sear-foundation-di';
import { KeyboardRouter, type KeyboardRouterHandlers } from './KeyboardRouter';

/** Keyboard router for hosts that do not expose a keyboard event source. */
@Injectable()
export class HeadlessKeyboardRouter extends KeyboardRouter {
  /** DI token for resolving HeadlessKeyboardRouter. */
  public static readonly symbol: symbol = Symbol.for('HeadlessKeyboardRouter');

  /** @inheritdoc */
  public override startListener(): void {}
  /** @inheritdoc */
  public override stopListener(): void {}
  /** Subscribes to state changes and returns an idempotent disposer. */
  public subscribe(_handlers: KeyboardRouterHandlers): void {}
}
