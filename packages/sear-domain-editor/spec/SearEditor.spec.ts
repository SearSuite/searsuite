import { SearEditor } from '../src';

describe('SearEditor', () => {
  it('constructs and exposes an idempotent initialization entry point', () => {
    const editor = new SearEditor();

    expect(SearEditor.symbol).toBe(Symbol.for('SearEditor'));
    expect(() => editor.initialize()).not.toThrow();
    expect(() => editor.initialize()).not.toThrow();
  });
});
