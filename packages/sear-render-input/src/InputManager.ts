import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Input } from './Input';
import { TextInput } from './TextInput';

/** Registry for input adapters owned by one editor instance. */
@Injectable()
export class InputManager {
  /** DI token for resolving the input manager. */
  public static readonly symbol: symbol = Symbol.for('InputManager');

  /** Input adapters keyed by their DI symbol. */
  private inputs = new Map<symbol, Input>();

  /**
   * Constructs the manager with the configured text input adapter.
   * @param textInput - Text input adapter resolved from the host.
   */
  constructor(@Inject(TextInput.symbol) public readonly textInput: Input) {}

  /**
   * Registers an input adapter.
   * @param symbol - Adapter symbol.
   * @param input - Adapter instance.
   */
  register(symbol: symbol, input: Input): void {
    this.inputs.set(symbol, input);
  }

  /**
   * Retrieves an input adapter by symbol.
   * @param symbol - Adapter symbol.
   * @returns Registered adapter, or void 0 when absent.
   */
  get<T extends Input>(symbol: symbol): T | undefined {
    return this.inputs.get(symbol) as T | undefined;
  }

  /** Returns the text-input adapter when it has been registered. */
  getTextInput(): TextInput | undefined {
    return this.get<TextInput>(TextInput.symbol);
  }
}
