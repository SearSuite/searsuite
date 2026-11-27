import {
  DocTransaction,
  inputCommand,
  deleteBackwardCommand,
  splitParagraphCommand,
  selectAllCommand,
  moveCursorCommand,
  type DocCommandContext,
} from '../src';
import type { DocSelection, RichDocNode } from '@searsuite/sear-domain-doc';
import type { NodeSchema, InsertStringOTOperation, DeleteStringOTOperation } from '@searsuite/sear-domain-ot';
import { RichDocOT, RichDocOTActionName } from '@searsuite/sear-domain-ot';

function makeDoc(...paragraphs: string[]): RichDocNode[] {
  return paragraphs.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })) as unknown as RichDocNode[];
}

function makeState(
  paragraphs: string[],
  anchorPath: number[],
  anchorOffset: number,
  headPath: number[],
  headOffset: number,
): DocCommandContext {
  return {
    pendingDoc: makeDoc(...paragraphs),
    docSelection: {
      anchor: { path: anchorPath, offset: anchorOffset },
      head: { path: headPath, offset: headOffset },
    },
    preferredX: null,
    lastSnapshot: null,
  };
}

function applyTransaction(state: DocCommandContext, tr: DocTransaction): { doc: RichDocNode[]; sel: DocSelection } {
  const allOps = tr.steps.flatMap((s) => s.ops);
  let doc = state.pendingDoc;
  if (allOps.length > 0) {
    const root = { type: 'doc' as const, content: doc } as NodeSchema;
    const newRoot = RichDocOT.apply(root, allOps);
    doc = (newRoot as unknown as { content: RichDocNode[] }).content;
  }
  let sel = state.docSelection;
  for (const step of tr.steps) {
    sel = step.mapSelection(sel, doc);
  }
  return { doc, sel };
}

function paragraphText(doc: RichDocNode[], paragraphIndex: number): string | undefined {
  const firstChild = doc[paragraphIndex]?.content[0];
  return firstChild && 'text' in firstChild && typeof firstChild.text === 'string' ? firstChild.text : void 0;
}

// ---------------------------------------------------------------------------
// DocTransaction atomic builders
// ---------------------------------------------------------------------------

describe('DocTransaction', () => {
  it('insertText produces si op and shifts cursor', () => {
    const tr = new DocTransaction();
    tr.insertText([0, 0], 5, 'hello');

    expect(tr.steps).toHaveLength(1);
    expect(tr.steps[0].ops).toHaveLength(1);

    const op = tr.steps[0].ops[0] as InsertStringOTOperation;
    expect(op.p).toEqual([0, 0, 5]);
    expect(op[RichDocOTActionName.StringInsert]).toBe('hello');

    const sel = tr.steps[0].mapSelection(
      {
        anchor: { path: [0, 0], offset: 5 },
        head: { path: [0, 0], offset: 5 },
      },
      [],
    );
    expect(sel.anchor.offset).toBe(10);
    expect(sel.head.offset).toBe(10);
  });

  it('deleteText produces sd op and collapses cursor in deleted range', () => {
    const tr = new DocTransaction();
    tr.deleteText([0, 0], 3, 'lo');

    const op = tr.steps[0].ops[0] as DeleteStringOTOperation;
    expect(op.p).toEqual([0, 0, 3]);
    expect(op[RichDocOTActionName.StringDelete]).toBe('lo');

    // cursor inside deleted range collapses to start
    const sel1 = tr.steps[0].mapSelection(
      {
        anchor: { path: [0, 0], offset: 4 },
        head: { path: [0, 0], offset: 4 },
      },
      [],
    );
    expect(sel1.anchor.offset).toBe(3);

    // cursor after deleted range shifts back
    const sel2 = tr.steps[0].mapSelection(
      {
        anchor: { path: [0, 0], offset: 10 },
        head: { path: [0, 0], offset: 10 },
      },
      [],
    );
    expect(sel2.anchor.offset).toBe(8);
  });

  it('setSelection replaces selection with no ops', () => {
    const tr = new DocTransaction();
    const newSel: DocSelection = {
      anchor: { path: [1, 0], offset: 3 },
      head: { path: [2, 0], offset: 7 },
    };
    tr.setSelection(newSel);

    expect(tr.steps).toHaveLength(1);
    expect(tr.steps[0].ops).toHaveLength(0);
    expect(
      tr.steps[0].mapSelection(
        {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
        [],
      ),
    ).toEqual(newSel);
  });

  it('meta get/set works', () => {
    const tr = new DocTransaction();
    tr.setMeta('foo', 42);
    expect(tr.getMeta<number>('foo')).toBe(42);
    expect(tr.getMeta<number>('bar')).toBeUndefined();
  });

  it('covers pathEquals false for different lengths', () => {
    const tr = new DocTransaction();
    tr.insertText([0], 5, 'hello');

    // mapCursorForInsertText when path is different
    const sel = tr.steps[0].mapSelection(
      { anchor: { path: [0, 0], offset: 5 }, head: { path: [0, 1], offset: 5 } },
      [],
    );
    expect(sel.anchor.path).toEqual([0, 0]);
  });

  it('covers deleteText mapCursor when path is different', () => {
    const tr = new DocTransaction();
    tr.deleteText([0], 3, 'lo');

    const sel = tr.steps[0].mapSelection(
      { anchor: { path: [0, 0], offset: 5 }, head: { path: [0, 0], offset: 5 } },
      [],
    );
    expect(sel.anchor.offset).toEqual(5);
  });
});

// ---------------------------------------------------------------------------
// inputCommand
// ---------------------------------------------------------------------------

describe('inputCommand', () => {
  it('inserts text at cursor and collapses selection', () => {
    const state = makeState(['Hello'], [0, 0], 5, [0, 0], 5);
    const tr = inputCommand(' World')(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(paragraphText(doc, 0)).toBe('Hello World');
    expect(sel.head).toEqual({ path: [0, 0], offset: 11 });
    expect(sel.anchor).toEqual(sel.head);
  });

  it('inserts text in the middle', () => {
    const state = makeState(['Hllo'], [0, 0], 1, [0, 0], 1);
    const tr = inputCommand('e')(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(paragraphText(doc, 0)).toBe('Hello');
    expect(sel.head.offset).toBe(2);
  });

  it('replaces a selected range with the inserted text', () => {
    const state = makeState(['Hello World'], [0, 0], 0, [0, 0], 5);
    const tr = inputCommand('Hi')(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(paragraphText(doc, 0)).toBe('Hi World');
    expect(sel.head).toEqual({ path: [0, 0], offset: 2 });
    expect(sel.anchor).toEqual(sel.head);
  });

  it('BUG-1133 replaces a reverse selection across paragraphs and preserves the suffix', () => {
    const state = makeState(['hello', 'world!'], [1, 0], 5, [0, 0], 5);
    const tr = inputCommand('X')(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);
    expect(doc).toHaveLength(1);
    expect(doc[0].content.map((node) => ('text' in node ? node.text : '')).join('')).toBe('helloX!');
    expect(sel.head).toEqual({ path: [0, 0], offset: 6 });
    const root = { type: 'doc', content: doc } as NodeSchema;
    const restored = RichDocOT.apply(root, RichDocOT.invert(tr.steps.flatMap((step) => step.ops)));
    expect((restored as unknown as { content: RichDocNode[] }).content).toEqual(state.pendingDoc);
  });

  it('replaces a selection across styled text nodes without losing the unselected tail', () => {
    const state = makeState([''], [0, 0], 1, [0, 1], 1);
    state.pendingDoc[0].content = [
      { type: 'text', text: 'ab', attrs: { textStyle: { bold: true } } },
      { type: 'text', text: 'cd', attrs: { textStyle: { italic: true } } },
      { type: 'text', text: 'ef' },
    ] as unknown as RichDocNode['content'];
    const { doc, sel } = applyTransaction(state, inputCommand('X')(new DocTransaction(), state));
    expect(doc[0].content.map((node) => ('text' in node ? node.text : ''))).toEqual(['aX', 'd', 'ef']);
    expect(doc[0].content[1].attrs).toEqual({ textStyle: { italic: true } });
    expect(sel.head).toEqual({ path: [0, 0], offset: 2 });
  });

  it('inputCommand branches: missing content, mismatched paths, empty text', () => {
    // 1. Mismatched path length
    const state = makeState(['Hello'], [0, 0], 0, [0], 1);
    const tr = inputCommand('A')(new DocTransaction(), state);

    // 2. Head before anchor
    const state2 = makeState(['Hello'], [0, 0], 5, [0, 0], 0);
    const tr2 = inputCommand('B')(new DocTransaction(), state2);

    // 3. Different paths
    const state3 = makeState(['A', 'B'], [0, 0], 0, [1, 0], 0);
    const tr3 = inputCommand('C')(new DocTransaction(), state3);

    // 4. Missing node resolving text
    const state4 = makeState(['A'], [0, 0], 0, [0, 0], 0);
    state4.pendingDoc = []; // Empty doc
    const tr4 = inputCommand('D')(new DocTransaction(), state4);

    // 5. Compare cursor with missing path components
    const state5 = makeState(['A'], [0], 0, [0, 0], 0);
    inputCommand('E')(new DocTransaction(), state5);

    // 6. Delete range where selected text is empty string
    const state6 = makeState([''], [0, 0], 0, [0, 0], 0);
    // make it different so isCollapsed is false, but text resolves to empty
    state6.docSelection.anchor.offset = 0;
    state6.docSelection.head.offset = 1;
    inputCommand('F')(new DocTransaction(), state6);

    // 7. Test missing node
    const state7 = makeState(['A'], [1, 0], 0, [1, 0], 0);
    inputCommand('G')(new DocTransaction(), state7);

    // 8. Test node without text property
    const state8 = makeState(['A'], [0, 0], 0, [0, 0], 0);
    state8.pendingDoc[0].content[0] = { type: 'notext' } as any;
    inputCommand('H')(new DocTransaction(), state8);

    // 9. Test content is undefined for next loop iteration
    const state9 = makeState(['A'], [0, 0], 0, [0, 0], 1); // uncollapsed so resolveTextContent is called
    state9.pendingDoc[0].content = undefined as any;
    inputCommand('I')(new DocTransaction(), state9);

    // 10. Empty path
    const state10 = makeState(['A'], [], 0, [], 1);
    inputCommand('J')(new DocTransaction(), state10);
  });
});

// ---------------------------------------------------------------------------
// deleteBackwardCommand
// ---------------------------------------------------------------------------

describe('deleteBackwardCommand', () => {
  it('deletes a selection across paragraphs and keeps text after the selection', () => {
    const state = makeState(['abc', 'def'], [0, 0], 1, [1, 0], 2);
    const { doc, sel } = applyTransaction(state, deleteBackwardCommand()(new DocTransaction(), state));
    expect(doc).toHaveLength(1);
    expect(doc[0].content.map((node) => ('text' in node ? node.text : '')).join('')).toBe('af');
    expect(sel.head).toEqual({ path: [0, 0], offset: 1 });
  });

  it.each(['a😀b', 'ae\u0301b', 'a👩‍💻b'])('BUG-075 deletes one complete grapheme in %s', (text) => {
    const offset = text.indexOf('b');
    const state = makeState([text], [0, 0], offset, [0, 0], offset);
    const tr = deleteBackwardCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);
    expect(paragraphText(doc, 0)).toBe('ab');
    expect(sel.head.offset).toBe(1);
  });

  it('deletes a single character before cursor', () => {
    const state = makeState(['Hello'], [0, 0], 5, [0, 0], 5);
    const tr = deleteBackwardCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(paragraphText(doc, 0)).toBe('Hell');
    expect(sel.head.offset).toBe(4);
  });

  it('deletes range selection within same text node', () => {
    const state = makeState(['Hello World'], [0, 0], 0, [0, 0], 6);
    const tr = deleteBackwardCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(paragraphText(doc, 0)).toBe('World');
    expect(sel.head).toEqual({ path: [0, 0], offset: 0 });
  });

  it('merges paragraph when backspace at start', () => {
    const state = makeState(['Hello', 'World'], [1, 0], 0, [1, 0], 0);
    const tr = deleteBackwardCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(doc).toHaveLength(1);
    expect(paragraphText(doc, 0)).toBe('HelloWorld');
    expect(sel.head).toEqual({ path: [0, 0], offset: 5 });
  });

  it('does nothing at the very start of the document', () => {
    const state = makeState(['Hello'], [0, 0], 0, [0, 0], 0);
    const tr = deleteBackwardCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(paragraphText(doc, 0)).toBe('Hello');
    expect(sel.head).toEqual({ path: [0, 0], offset: 0 });
  });

  it('deleteBackwardCommand branches: mismatched paths', () => {
    const state = makeState(['A', 'B'], [0, 0], 0, [1, 0], 0);
    deleteBackwardCommand()(new DocTransaction(), state);

    // Mismatched lengths
    const state2 = makeState(['A', 'B'], [0], 0, [1, 0], 0);
    deleteBackwardCommand()(new DocTransaction(), state2);

    // Invalid char
    const state3 = makeState([''], [0, 0], 1, [0, 0], 1);
    deleteBackwardCommand()(new DocTransaction(), state3);

    // para merge empty prev text
    const state4 = makeState(['', 'A'], [1, 0], 0, [1, 0], 0);
    deleteBackwardCommand()(new DocTransaction(), state4);

    // empty toDelete length in sameNode range
    const state5 = makeState([''], [0, 0], 0, [0, 0], 1);
    deleteBackwardCommand()(new DocTransaction(), state5);

    // currentText length is 0 for para merge
    const state6 = makeState(['A', ''], [1, 0], 0, [1, 0], 0);
    deleteBackwardCommand()(new DocTransaction(), state6);
  });
});

// ---------------------------------------------------------------------------
// splitParagraphCommand
// ---------------------------------------------------------------------------

describe('splitParagraphCommand', () => {
  it('splits paragraph at cursor', () => {
    const state = makeState(['Hello World'], [0, 0], 5, [0, 0], 5);
    const tr = splitParagraphCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(doc).toHaveLength(2);
    expect(paragraphText(doc, 0)).toBe('Hello');
    expect(paragraphText(doc, 1)).toBe(' World');
    expect(sel.head).toEqual({ path: [1, 0], offset: 0 });
  });

  it('splits at end creates empty new paragraph', () => {
    const state = makeState(['Hello'], [0, 0], 5, [0, 0], 5);
    const tr = splitParagraphCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(doc).toHaveLength(2);
    expect(paragraphText(doc, 0)).toBe('Hello');
    expect(paragraphText(doc, 1)).toBe('');
    expect(sel.head).toEqual({ path: [1, 0], offset: 0 });
  });

  it('splits at start creates empty current paragraph', () => {
    const state = makeState(['Hello'], [0, 0], 0, [0, 0], 0);
    const tr = splitParagraphCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(doc).toHaveLength(2);
    expect(paragraphText(doc, 0)).toBe('');
    expect(paragraphText(doc, 1)).toBe('Hello');
    expect(sel.head).toEqual({ path: [1, 0], offset: 0 });
  });

  it('deletes range then splits correctly', () => {
    // text="Hello World", selection=[6,11], head=11
    // After delete: "Hello ", cursor at 6
    // Split at 6: before="Hello ", after=""
    const state = makeState(['Hello World'], [0, 0], 6, [0, 0], 11);
    const tr = splitParagraphCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(doc).toHaveLength(2);
    expect(paragraphText(doc, 0)).toBe('Hello ');
    expect(paragraphText(doc, 1)).toBe('');
    expect(sel.head).toEqual({ path: [1, 0], offset: 0 });
  });

  it('deletes range then splits — selection at start', () => {
    // text="Hello World", selection=[0,5], head=5
    // After delete: " World", cursor at 0
    // Split at 0: before="", after=" World"
    const state = makeState(['Hello World'], [0, 0], 0, [0, 0], 5);
    const tr = splitParagraphCommand()(new DocTransaction(), state);
    const { doc, sel } = applyTransaction(state, tr);

    expect(doc).toHaveLength(2);
    expect(paragraphText(doc, 0)).toBe('');
    expect(paragraphText(doc, 1)).toBe(' World');
    expect(sel.head).toEqual({ path: [1, 0], offset: 0 });
  });

  it('splits paragraph with extra nodes after cursor', () => {
    const doc = makeDoc('Hello');
    doc[0].content.push({ type: 'custom' } as unknown as RichDocNode);
    const state = makeState([], [0, 0], 3, [0, 0], 3);
    state.pendingDoc = doc; // override with extra node

    const tr = splitParagraphCommand()(new DocTransaction(), state);
    const { doc: newDoc, sel } = applyTransaction(state, tr);

    expect(newDoc).toHaveLength(2);
    expect(paragraphText(newDoc, 0)).toBe('Hel');
    expect(newDoc[0].content).toHaveLength(1);
    expect(paragraphText(newDoc, 1)).toBe('lo');
    expect(newDoc[1].content).toHaveLength(2);
    expect(newDoc[1].content[1].type).toBe('custom');
  });

  it('splitParagraphCommand branches: different paths', () => {
    const state = makeState(['A', 'B'], [0, 0], 0, [1, 0], 0);
    splitParagraphCommand()(new DocTransaction(), state);

    // missing text / extra node logic branch
    const state2 = makeState(['A'], [0, 0], 0, [0, 0], 0);
    state2.pendingDoc[0].content = [{ type: 'custom' } as any];
    splitParagraphCommand()(new DocTransaction(), state2);

    // toDelete length is 0
    const state3 = makeState([''], [0, 0], 0, [0, 0], 1);
    splitParagraphCommand()(new DocTransaction(), state3);
  });
});

// ---------------------------------------------------------------------------
// selectAllCommand
// ---------------------------------------------------------------------------

describe('selectAllCommand', () => {
  it('selects entire single-paragraph document', () => {
    const state = makeState(['Hello World'], [0, 0], 5, [0, 0], 5);
    const tr = selectAllCommand()(new DocTransaction(), state);
    const { sel } = applyTransaction(state, tr);

    expect(sel.anchor).toEqual({ path: [0, 0], offset: 0 });
    expect(sel.head).toEqual({ path: [0, 0], offset: 11 });
  });

  it('selects multi-paragraph document', () => {
    const state = makeState(['Hello', 'World', 'Foo'], [1, 0], 3, [1, 0], 3);
    const tr = selectAllCommand()(new DocTransaction(), state);
    const { sel } = applyTransaction(state, tr);

    expect(sel.anchor).toEqual({ path: [0, 0], offset: 0 });
    expect(sel.head).toEqual({ path: [2, 0], offset: 3 });
  });

  it('sets selectionOnly meta', () => {
    const state = makeState(['Hi'], [0, 0], 0, [0, 0], 0);
    const tr = selectAllCommand()(new DocTransaction(), state);

    expect(tr.getMeta<boolean>('selectionOnly')).toBe(true);
  });

  it('does nothing for empty document', () => {
    const state: DocCommandContext = {
      pendingDoc: [],
      docSelection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 0 },
      },
      preferredX: null,
      lastSnapshot: null,
    };
    const tr = selectAllCommand()(new DocTransaction(), state);

    expect(tr.steps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// moveCursorCommand
// ---------------------------------------------------------------------------

describe('moveCursorCommand', () => {
  const mockLayoutEngine = {
    cursorToPoint: jest.fn().mockReturnValue({ x: 10, y: 0, height: 14 }),
    pointToCursor: jest.fn().mockImplementation((x, y) => ({ path: [0, 0], offset: x > 5 ? 2 : 0 })),
    findLineIndex: jest.fn().mockReturnValue(0),
  } as any;

  it('moves cursor left and right', () => {
    const state = makeState(['Hello', 'World'], [0, 0], 1, [0, 0], 1);

    // Left
    let tr = moveCursorCommand('left', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 0 });

    // Left across paragraph
    state.docSelection.head = { path: [1, 0], offset: 0 };
    tr = moveCursorCommand('left', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 5 });

    // Left at start
    state.docSelection.head = { path: [0, 0], offset: 0 };
    tr = moveCursorCommand('left', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 0 });

    // Right
    state.docSelection.head = { path: [0, 0], offset: 1 };
    tr = moveCursorCommand('right', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 2 });

    // Right across paragraph
    state.docSelection.head = { path: [0, 0], offset: 5 };
    tr = moveCursorCommand('right', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [1, 0], offset: 0 });

    // Right at end
    state.docSelection.head = { path: [1, 0], offset: 5 };
    tr = moveCursorCommand('right', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [1, 0], offset: 5 });
  });

  it.each(['a😀b', 'ae\u0301b', 'a👩‍💻b'])('BUG-977 moves across complete graphemes in %s', (text) => {
    const state = makeState([text], [0, 0], text.length, [0, 0], text.length);
    const move = (direction: 'left' | 'right', offset: number) => {
      state.docSelection.head = { path: [0, 0], offset };
      const tr = moveCursorCommand(direction, false, mockLayoutEngine)(new DocTransaction(), state);
      return tr.steps[0].mapSelection(state.docSelection, []).head.offset;
    };
    const beforeLast = move('left', text.length);
    const beforeGrapheme = move('left', beforeLast);
    expect(beforeGrapheme).toBe(1);
    expect(text.slice(0, beforeGrapheme) + 'X' + text.slice(beforeGrapheme)).toBe(`aX${text.slice(1)}`);
    expect(move('right', beforeGrapheme)).toBe(beforeLast);
  });

  it('moves cursor up and down', () => {
    const state = makeState(['Hello'], [0, 0], 1, [0, 0], 1);
    state.lastSnapshot = { lines: [{ y: 0 }, { y: 20 }] } as any;

    // Up at first line returns same
    mockLayoutEngine.findLineIndex.mockReturnValueOnce(0);
    let tr = moveCursorCommand('up', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 1 });

    // Up to previous line
    mockLayoutEngine.findLineIndex.mockReturnValueOnce(1);
    mockLayoutEngine.pointToCursor.mockReturnValueOnce({ path: [0, 0], offset: 0 });
    tr = moveCursorCommand('up', true, mockLayoutEngine)(new DocTransaction(), state);
    const sel = tr.steps[0].mapSelection(state.docSelection, []);
    expect(sel.anchor).toEqual({ path: [0, 0], offset: 1 }); // shift key
    expect(sel.head).toEqual({ path: [0, 0], offset: 0 });

    // Down to next line
    mockLayoutEngine.findLineIndex.mockReturnValueOnce(0);
    mockLayoutEngine.pointToCursor.mockReturnValueOnce({ path: [0, 0], offset: 2 });
    tr = moveCursorCommand('down', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 2 });

    // Down at last line returns same
    mockLayoutEngine.findLineIndex.mockReturnValueOnce(1);
    tr = moveCursorCommand('down', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 1 });

    // Handles missing snapshot
    state.lastSnapshot = null;
    tr = moveCursorCommand('up', false, mockLayoutEngine)(new DocTransaction(), state);
    expect(tr.steps[0].mapSelection(state.docSelection, []).head).toEqual({ path: [0, 0], offset: 1 });
  });

  it('moveCursorCommand branches: layout snapshot empty, right at end of doc, left at start', () => {
    const state = makeState(['A'], [0, 0], 0, [0, 0], 0);

    // lastSnapshot lines empty
    state.lastSnapshot = { lines: [] } as any;
    moveCursorCommand('up', false, mockLayoutEngine)(new DocTransaction(), state);

    // preferredX null fallback in tr metadata
    state.lastSnapshot = { lines: [{ y: 0 }] } as any;
    state.preferredX = undefined as any;
    moveCursorCommand('up', false, mockLayoutEngine)(new DocTransaction(), state);

    // state.preferredX has a value
    state.preferredX = 50;
    moveCursorCommand('up', false, mockLayoutEngine)(new DocTransaction(), state);
  });
});
