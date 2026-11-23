import { DocCaretState } from '../src/doc/DocCaretState';

describe('DocCaretState', () => {
  it('keeps retained runtime properties from bypassing command dispatch', () => {
    const caret = new DocCaretState();
    caret.enforceCommandBoundary(() => false);

    expect((caret as unknown as Record<string, unknown>)['visible']).toBeUndefined();
    expect(() => { (caret as unknown as Record<string, unknown>)['visible'] = false; }).toThrow();
    expect(() => caret.setVisible(false)).toThrow('editor.commands.run');
    expect(caret.isVisible()).toBe(true);
  });
});
