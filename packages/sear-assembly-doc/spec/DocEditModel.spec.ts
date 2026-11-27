/** @jest-environment node */
import { paraText, stringToRichDoc } from '@searsuite/sear-domain-doc';
import { DocEditModel } from '../src';

describe('DocEditModel without presentation', () => {
  it('owns multiline input and OT undo/redo without a renderer', () => {
    const model = new DocEditModel(stringToRichDoc('seed'));
    model.handleInput({ type: 'insertText', text: '\n中文😀' });
    expect(model.getDocument().map(paraText).join('\n')).toBe('seed\n中文😀');
    model.handleInput({ type: 'keyDown', key: 'z', ctrlKey: true });
    expect(model.getDocument().map(paraText).join('\n')).toBe('seed');
    model.handleInput({ type: 'keyDown', key: 'z', ctrlKey: true, shiftKey: true });
    expect(model.getDocument().map(paraText).join('\n')).toBe('seed\n中文😀');
    model.dispose();
  });

  it('detaches retained snapshots and guards all document mutations', () => {
    let writing = true;
    const model = new DocEditModel(stringToRichDoc('original'), () => {
      if (!writing) throw new Error('command required');
    });
    const snapshot = model.getDocument();
    snapshot[0]!.content = [];
    expect(model.getDocument().map(paraText).join('\n')).toBe('original');
    writing = false;
    expect(() => model.handleInput({ type: 'insertText', text: 'x' })).toThrow('command required');
    expect(() => model.setSelection(model.getSelection())).toThrow('command required');
    expect(() => model.cancel()).toThrow('command required');
    writing = true;
    model.dispose();
  });
});
