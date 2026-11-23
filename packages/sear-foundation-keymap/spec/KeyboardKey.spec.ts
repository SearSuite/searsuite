import { KeyboardKey } from '../src';

describe('KeyboardKey', () => {
  it('maps editor commands to browser-standard KeyboardEvent.key values', () => {
    expect(KeyboardKey.ArrowDown).toBe('ArrowDown');
    expect(KeyboardKey.SelectAll).toBe('a');
    expect(KeyboardKey.Bold).toBe('b');
    expect(KeyboardKey.Italic).toBe('i');
    expect(KeyboardKey.Underline).toBe('u');
    expect(KeyboardKey.Strikethrough).toBe('x');
    expect(KeyboardKey.Equal).toBe('=');
    expect(KeyboardKey.Minus).toBe('_');
    expect(KeyboardKey.Zero).toBe('0');
  });
});
