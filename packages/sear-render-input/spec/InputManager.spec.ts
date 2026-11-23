import {
  HeadlessKeyboardRouter,
  HeadlessPointerCapture,
  HeadlessTextInput,
  Input,
  InputManager,
  TextInput,
  TextInputKind,
  type TextInputEvent,
} from '../src';

class TestInput extends Input {
  startListener(): void {}
  stopListener(): void {}
}

describe('InputManager and base text input contract', () => {
  it('classifies both text phases and narrows mixed input actions', () => {
    const events: Array<TextInputEvent | { kind: 'delete' } | { kind: 'arrow' }> = [
      { kind: TextInputKind.Text, text: 'hello' },
      { kind: TextInputKind.CompositionUpdate, text: '\u4e2d\u6587', caretOffset: 2 },
      { kind: TextInputKind.CompositionUpdate, text: '', caretOffset: 0 },
      { kind: 'delete' },
      { kind: 'arrow' },
    ];
    expect(events.map((event) => TextInput.isTextInput(event))).toEqual([true, true, true, false, false]);
    const texts = events.filter(TextInput.isTextInput).map((event) => event.text);
    expect(texts).toEqual(['hello', '\u4e2d\u6587', '']);
  });
  it('registers typed input adapters and returns the primary text input', () => {
    const textInput = new HeadlessTextInput();
    const manager = new InputManager(textInput);
    const secondaryKey = Symbol('secondary');
    const secondary = new TestInput();

    manager.register(TextInput.symbol, textInput);
    manager.register(secondaryKey, secondary);
    textInput.startListener();
    textInput.subscribe({});
    textInput.stopListener();

    expect(manager.get(TextInput.symbol)).toBe(textInput);
    expect(manager.get(secondaryKey)).toBe(secondary);
    expect(manager.get(Symbol('missing'))).toBeUndefined();
    expect(manager.getTextInput()).toBe(textInput);
  });

  it('makes unsupported base text input operations explicit while positioning hooks are safe no-ops', () => {
    const textInput = new TextInput();

    expect(() => textInput.startListener()).toThrow(
      'TextInput.startListener must be implemented by concrete input adapters.',
    );
    expect(() => textInput.stopListener()).toThrow(
      'TextInput.stopListener must be implemented by concrete input adapters.',
    );
    expect(() => textInput.subscribe({})).toThrow(
      'TextInput.subscribe must be implemented by concrete input adapters.',
    );
    expect(() => textInput.setPosition(10, 20)).not.toThrow();
    expect(() => textInput.refocus()).not.toThrow();
  });

  it('provides complete no-op keyboard and pointer lifecycles for headless hosts', () => {
    const router = new HeadlessKeyboardRouter();
    const pointerCapture = new HeadlessPointerCapture();

    expect(() => router.startListener()).not.toThrow();
    expect(() => router.subscribe({ onEnter: () => void 0 })).not.toThrow();
    expect(() => router.stopListener()).not.toThrow();
    expect(() => pointerCapture.start({ onRelease: () => void 0 })()).not.toThrow();
    expect(() => pointerCapture.stop()).not.toThrow();
  });
});
