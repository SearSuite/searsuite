import { SearError } from '@searsuite/sear-foundation-error';
import { Input } from './Input';
import { TextInputKind, type TextInputEvent, type TextInputHandlers } from './TextInputEvent';

/** Routes host text and composition input through portable subscriptions. */
export class TextInput extends Input {
  /** DI token for resolving TextInput. */
  public static readonly symbol: symbol = Symbol.for('TextInput');
  /** Classifies text events within a typed input-action union. */
  public static isTextInput<T extends { readonly kind: string }>(event: T): event is T & TextInputEvent {
    return event.kind === TextInputKind.Text || event.kind === TextInputKind.CompositionUpdate;
  }
  /** Creates a TextInput instance. */
  constructor() {
    super();
  }
  /** Starts forwarding host text and composition events. */
  startListener(): void {
    throw new SearError('TextInput.startListener must be implemented by concrete input adapters.');
  }
  /** Stops forwarding host text and composition events. */
  stopListener(): void {
    throw new SearError('TextInput.stopListener must be implemented by concrete input adapters.');
  }
  /** Subscribes to state changes and returns an idempotent disposer. */
  subscribe(_handlers: TextInputHandlers): void {
    throw new SearError('TextInput.subscribe must be implemented by concrete input adapters.');
  }
  /** Updates the position. */
  setPosition(_x: number, _y: number): void {
    // no-op by default; WebTextInput overrides to move the hidden input
  }
  /** Restores focus to the hidden host text-input surface. */
  refocus(): void {
    // no-op by default; WebTextInput overrides to restore focus
  }
}
