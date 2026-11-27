import { DocTransaction } from '../src/DocTransaction';
import { RichDocOT } from '@searsuite/sear-domain-ot';
import {
  DocNodeRegistry,
  ParagraphNode,
  TextNode,
  replaceInlineTextStyle,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';

describe('DocTransaction', () => {
  it('maps cursor correctly for insertText', () => {
    const tr = new DocTransaction();
    tr.insertText([0], 5, 'hello');
    const step = tr.steps[0];

    // Path matches, offset >= insertOffset
    expect(step.mapSelection({ anchor: { path: [0], offset: 5 }, head: { path: [0], offset: 6 } }, [])).toEqual({
      anchor: { path: [0], offset: 10 },
      head: { path: [0], offset: 11 },
    });

    // Path matches, offset < insertOffset
    expect(step.mapSelection({ anchor: { path: [0], offset: 2 }, head: { path: [0], offset: 2 } }, [])).toEqual({
      anchor: { path: [0], offset: 2 },
      head: { path: [0], offset: 2 },
    });

    // Path doesn't match (different length - covers line 6 branch)
    expect(step.mapSelection({ anchor: { path: [0, 1], offset: 5 }, head: { path: [0, 1], offset: 6 } }, [])).toEqual({
      anchor: { path: [0, 1], offset: 5 },
      head: { path: [0, 1], offset: 6 },
    });

    // Path doesn't match (same length)
    expect(step.mapSelection({ anchor: { path: [1], offset: 5 }, head: { path: [1], offset: 6 } }, [])).toEqual({
      anchor: { path: [1], offset: 5 },
      head: { path: [1], offset: 6 },
    });
  });

  it('maps cursor correctly for deleteText', () => {
    const tr = new DocTransaction();
    tr.deleteText([0], 5, 'hello');
    const step = tr.steps[0];

    // Path matches, offset >= deleteOffset + deleteLen
    expect(step.mapSelection({ anchor: { path: [0], offset: 10 }, head: { path: [0], offset: 10 } }, [])).toEqual({
      anchor: { path: [0], offset: 5 },
      head: { path: [0], offset: 5 },
    });

    // Path matches, inside deleted region
    expect(step.mapSelection({ anchor: { path: [0], offset: 7 }, head: { path: [0], offset: 7 } }, [])).toEqual({
      anchor: { path: [0], offset: 5 },
      head: { path: [0], offset: 5 },
    });

    // Path matches, offset <= deleteOffset
    expect(step.mapSelection({ anchor: { path: [0], offset: 2 }, head: { path: [0], offset: 2 } }, [])).toEqual({
      anchor: { path: [0], offset: 2 },
      head: { path: [0], offset: 2 },
    });

    // Path doesn't match (covers line 31 false branch)
    expect(step.mapSelection({ anchor: { path: [1], offset: 10 }, head: { path: [1], offset: 10 } }, [])).toEqual({
      anchor: { path: [1], offset: 10 },
      head: { path: [1], offset: 10 },
    });
  });

  it('adds nodes and deletes nodes without mapping cursor', () => {
    const tr = new DocTransaction();
    tr.insertNode([1], { type: 'paragraph' } as any);
    tr.deleteNode([2], { type: 'paragraph' } as any);

    expect(tr.steps[0].mapSelection({ anchor: { path: [0], offset: 0 }, head: { path: [0], offset: 0 } }, [])).toEqual({
      anchor: { path: [0], offset: 0 },
      head: { path: [0], offset: 0 },
    });

    expect(tr.steps[1].mapSelection({ anchor: { path: [0], offset: 0 }, head: { path: [0], offset: 0 } }, [])).toEqual({
      anchor: { path: [0], offset: 0 },
      head: { path: [0], offset: 0 },
    });
  });

  it('handles meta data', () => {
    const tr = new DocTransaction();
    tr.setMeta('test', 123);
    expect(tr.getMeta('test')).toBe(123);
    expect(tr.getMeta('missing')).toBeUndefined();
  });

  it('styles only the selected text child instead of all following inline children', () => {
    const document = [
      DocNodeRegistry.create({
        type: ParagraphNode.nodeType,
        content: [
          { type: TextNode.nodeType, text: 'abc', attrs: {} },
          { type: TextNode.nodeType, text: 'DEF', attrs: {} },
        ],
      }),
    ] as RichDocNode[];
    const selection = {
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 2 },
    };

    const transaction = new DocTransaction().setInlineTextStyle(document, selection, 'fontFamily', 'Courier New');
    const root = RichDocOT.apply(
      { type: 'doc', content: document } as never,
      transaction.steps.flatMap((step) => step.ops) as never,
    ) as unknown as { readonly content: readonly RichDocNode[] };
    const content = root.content[0].content as readonly RichDocNode[];

    expect(transaction.steps[0].ops[0]).toMatchObject({
      p: [0, 0],
      nd: expect.objectContaining({ type: TextNode.nodeType, text: 'abc', attrs: {} }),
      ni: expect.objectContaining({ type: TextNode.nodeType, text: 'a', attrs: {} }),
    });

    expect(content.map((node) => (node as TextNode).text)).toEqual(['a', 'b', 'c', 'DEF']);
    expect(content.map((node) => node.attrs)).toEqual([{}, { textStyle: { fontFamily: 'Courier New' } }, {}, {}]);

    const replaced = replaceInlineTextStyle(document, selection, 'fontFamily', 'Courier New');
    const replacedContent = replaced[0].content as readonly RichDocNode[];
    expect(replacedContent.map((node) => (node as TextNode).text)).toEqual(['a', 'b', 'c', 'DEF']);
    expect(replacedContent.map((node) => node.attrs)).toEqual([
      {},
      { textStyle: { fontFamily: 'Courier New' } },
      {},
      {},
    ]);
  });

  it('uses a caller-provided inline style attrs patcher when building OT operations', () => {
    const document = [
      DocNodeRegistry.create({
        type: ParagraphNode.nodeType,
        content: [{ type: TextNode.nodeType, text: 'hello', attrs: {} }],
      }),
    ] as RichDocNode[];
    const selection = {
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    };

    const transaction = new DocTransaction().setInlineTextStyle(
      document,
      selection,
      'pluginStyle',
      'enabled',
      (attrs) => ({ ...attrs, pluginOwned: true }),
    );
    const root = RichDocOT.apply(
      { type: 'doc', content: document } as never,
      transaction.steps.flatMap((step) => step.ops) as never,
    ) as unknown as { readonly content: readonly RichDocNode[] };
    const content = root.content[0].content as readonly RichDocNode[];

    expect(content.map((node) => (node as TextNode).text)).toEqual(['h', 'ell', 'o']);
    expect(content.map((node) => node.attrs)).toEqual([{}, { pluginOwned: true }, {}]);
  });

  it('sets selection', () => {
    const tr = new DocTransaction();
    const sel = { anchor: { path: [0], offset: 0 }, head: { path: [0], offset: 0 } };
    tr.setSelection(sel);
    expect(tr.steps[0].mapSelection(sel, [])).toBe(sel);
  });
});
