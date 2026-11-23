import { DocNodeRegistry, resolveDocNodeId } from '@searsuite/sear-domain-doc';
import { DocTransactionRenderOperationType } from '@searsuite/sear-domain-commands';
import { RichDocOTActionName, type Operation } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { DocInputTransactionMeta } from '../src/DocInputPlugin';
import {
  collectDocReflowBlockIds,
  collectDocRepaintBlockIds,
  collectDocRenderOperations,
} from '../src/DocRenderDirtyBlocks';

const pluginKey = { key: 'doc.dirty-blocks.spec' };

function createParagraph(text: string) {
  return DocNodeRegistry.create({
    type: DocNodeRegistry.requireDefaultBlockType(),
    content: [DocNodeRegistry.create({ type: DocNodeRegistry.requireDefaultTextType(), text })],
  });
}

function createDocRenderTransaction(
  operation: Operation,
  renderOperation: DocTransactionRenderOperationType = DocTransactionRenderOperationType.Reflow,
): Transaction {
  const transaction = createTransaction(pluginKey);
  transaction.addOperation([operation]);
  transaction.setMeta(DocInputTransactionMeta.RenderOperation, renderOperation);
  return transaction;
}

describe('Doc render operations', () => {
  it('wraps block-local text OT as reflow operations', () => {
    const document = [createParagraph('one'), createParagraph('two')];
    const transaction = createDocRenderTransaction({
      p: [1, 0, 1],
      [RichDocOTActionName.StringInsert]: '!',
    });

    const renderOperations = collectDocRenderOperations([transaction]);

    expect(renderOperations).toEqual([{ type: DocTransactionRenderOperationType.Reflow, ot: transaction.operations[0] }]);
    expect(collectDocReflowBlockIds(renderOperations, document)).toEqual(new Set([resolveDocNodeId(document[1], [1])]));
    expect(collectDocRepaintBlockIds(renderOperations, document)).toEqual(new Set());
  });

  it('returns an empty set when render requests contain no committed document operations', () => {
    const renderOperations = collectDocRenderOperations([]);

    expect(renderOperations).toEqual([]);
    expect(collectDocReflowBlockIds(renderOperations, [createParagraph('one')])).toEqual(new Set());
  });

  it('wraps repaint inline style attr updates as repaint operations', () => {
    const document = [createParagraph('one')];
    const transaction = createDocRenderTransaction(
      {
        p: [0, 0, 'textStyle'],
        [RichDocOTActionName.UpdateAttrs]: { prev: {}, value: { color: '#f00' } },
      },
      DocTransactionRenderOperationType.Repaint,
    );

    const renderOperations = collectDocRenderOperations([transaction]);

    expect(renderOperations).toEqual([{ type: DocTransactionRenderOperationType.Repaint, ot: transaction.operations[0] }]);
    expect(collectDocReflowBlockIds(renderOperations, document)).toEqual(new Set());
    expect(collectDocRepaintBlockIds(renderOperations, document)).toEqual(new Set([resolveDocNodeId(document[0], [0])]));
  });

  it('keeps transactions without render operation metadata conservative as reflow operations', () => {
    const document = [createParagraph('one')];
    const transaction = createTransaction(pluginKey);
    transaction.addOperation([{
      p: [0, 0, 'textStyle'],
      [RichDocOTActionName.UpdateAttrs]: { prev: {}, value: { fontSize: 24 } },
    }]);

    const renderOperations = collectDocRenderOperations([transaction]);

    expect(renderOperations).toEqual([{ type: DocTransactionRenderOperationType.Reflow, ot: transaction.operations[0] }]);
    expect(collectDocReflowBlockIds(renderOperations, document)).toEqual(new Set([resolveDocNodeId(document[0], [0])]));
  });

  it('falls back to whole-document reflow for top-level replacement operations', () => {
    const transaction = createTransaction(pluginKey);
    transaction.addOperation([
      {
        p: [0],
        [RichDocOTActionName.NodeDelete]: createParagraph('one'),
      },
      {
        p: [0],
        [RichDocOTActionName.NodeInsert]: createParagraph('next'),
      },
    ] as never);
    const renderOperations = collectDocRenderOperations([transaction]);

    expect(collectDocReflowBlockIds(renderOperations, [createParagraph('one')])).toBeNull();
  });

  it('falls back to whole-document reflow for top-level structure operations', () => {
    const transaction = createDocRenderTransaction({
      p: [1],
      [RichDocOTActionName.NodeInsert]: createParagraph('inserted'),
    });
    const renderOperations = collectDocRenderOperations([transaction]);

    expect(collectDocReflowBlockIds(renderOperations, [createParagraph('one')])).toBeNull();
  });
});
