import { Injectable } from '@searsuite/sear-foundation-di';
import { SearToolbar } from './SearToolbar';

/** Toolbar implementation for hosts without a UI surface. */
@Injectable()
export class HeadlessToolbar extends SearToolbar {
  /** DI token for resolving HeadlessToolbar. */
  public static readonly symbol: symbol = Symbol.for('HeadlessToolbar');

  public mount(_target: unknown): void {}
  public destroy(): void {}
}
