import { FakeSheetEmbeddedEditor, SheetEmbeddedEditor } from '../src';
import type { SheetEmbeddedEditorContext, SheetDocument } from '../src';

function createContext(document: SheetDocument, commit = jest.fn()): SheetEmbeddedEditorContext {
  return {
    renderContext: {} as never,
    geometry: {
      cellRect: { x: 10, y: 20, width: 100, height: 30 },
      toLocalPoint: (point) => ({ x: point.x - 10, y: point.y - 20 }),
      toSheetPoint: (point) => ({ x: point.x + 10, y: point.y + 20 }),
    },
    documentAccessor: { read: () => document, commit },
  };
}

describe('Sheet editor contract', () => {
  it('exposes a stable DI token and keeps Fake editor state behind the contract', () => {
    expect(SheetEmbeddedEditor.symbol).toBe(Symbol.for('SheetEmbeddedEditor'));
    const editor = new FakeSheetEmbeddedEditor();
    const initial = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }];
    const commit = jest.fn();
    const session = editor.createEditSession(createContext(initial, commit));

    session.handleInput({ type: 'insertText', text: ' world' });
    session.handleInput({ type: 'compositionStart', text: '\u4e2d' });
    expect(session.getComposition()).toEqual({ active: true, text: '\u4e2d' });
    session.handleInput({ type: 'compositionEnd', text: '\u4e2d' });
    expect(session.getComposition()).toBeNull();
    session.setInlineStyle({ attrs: { fontFamily: 'Arial' } });
    const document = session.commit();

    expect(document[0]?.content?.[0]?.text).toBe('hello world');
    expect(document[0]?.content?.[0]?.attrs).toEqual({ textStyle: { fontFamily: 'Arial' } });
    expect(commit).toHaveBeenCalledWith(document);
    expect(editor.inputs).toHaveLength(3);
    expect(editor.committedDocuments).toHaveLength(1);
  });

  it('supports render hit testing and idempotent disposal', () => {
    const editor = new FakeSheetEmbeddedEditor();
    const session = editor.createRenderSession(createContext([]));
    expect(session.hitTest({ type: 'pointerDown', point: { x: 20, y: 30 } })?.target).toBe('text');
    expect(session.hitTest({ type: 'pointerDown', point: { x: 0, y: 0 } })?.target).toBe('outside');
    session.dispose();
    session.dispose();
    editor.dispose();
    editor.dispose();
    expect(editor.disposeCount).toBe(1);
  });

  it('rejects retained edit-session writes outside an assembled Sheet command', () => {
    const editor = new FakeSheetEmbeddedEditor();
    const document = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }];
    const commit = jest.fn();
    let executing = true;
    const context = { ...createContext(document, commit), isCommandExecuting: () => executing };
    const session = editor.createEditSession(context);

    const selection = session.getSelection()!;
    (selection.anchor.path as number[])[0] = 9;
    (selection.anchor as { offset: number }).offset = 99;
    const update = session.render();
    (update.selection!.head.path as number[])[0] = 9;
    (update.invalidation!.rects![0] as { x: number }).x = 99;
    expect(session.getSelection()?.anchor).toEqual({ path: [0, 0], offset: 5 });
    expect(session.getSelection()?.head.path).toEqual([0, 0]);
    expect(context.geometry.cellRect.x).toBe(10);

    executing = false;
    expect(() => editor.createEditSession(context)).toThrow('editor.commands.run');
    expect(() => session.handleInput({ type: 'insertText', text: '!' })).toThrow('editor.commands.run');
    expect(() => session.handlePointer({ type: 'pointerDown', point: { x: 20, y: 30 } }))
      .toThrow('editor.commands.run');
    expect(() => session.setSelection({ anchor: { path: [0, 0], offset: 0 }, head: { path: [0, 0], offset: 0 } }))
      .toThrow('editor.commands.run');
    expect(() => session.setInlineStyle({ attrs: { fontFamily: 'Arial' } })).toThrow('editor.commands.run');
    expect(() => session.commit()).toThrow('editor.commands.run');
    expect(() => session.cancel()).toThrow('editor.commands.run');
    expect(() => session.dispose()).toThrow('editor.commands.run');
    expect(session.getDocument()[0]?.content?.[0]?.text).toBe('hello');
    expect(editor.inputs).toHaveLength(0);
    expect(commit).not.toHaveBeenCalled();

    executing = true;
    session.handlePointer({ type: 'pointerDown', point: { x: 20, y: 30 } });
    const cursor = session.getCursor()!;
    (cursor.rect as { x: number }).x = 99;
    expect(session.getCursor()?.rect.x).toBe(10);
    executing = false;
    editor.dispose();
    expect(() => session.getDocument()).toThrow('disposed');
  });
});
