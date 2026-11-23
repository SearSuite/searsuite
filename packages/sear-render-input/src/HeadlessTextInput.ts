import { Injectable } from '@searsuite/sear-foundation-di';
import { TextInput } from './TextInput';
import { type TextInputHandlers } from './TextInputEvent';

/** Text-input adapter that intentionally owns no platform input element. */
@Injectable()
export class HeadlessTextInput extends TextInput {
  /** DI token for resolving HeadlessTextInput. */
  public static readonly symbol: symbol = Symbol.for('HeadlessTextInput');

  /** @inheritdoc */
  public override startListener(): void {}
  /** @inheritdoc */
  public override stopListener(): void {}
  /** @inheritdoc */
  public override subscribe(_handlers: TextInputHandlers): void {}
}
