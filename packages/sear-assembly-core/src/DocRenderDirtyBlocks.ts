import { type DocNodeId, resolveDocNodeId, type RichDocNode } from '@searsuite/sear-domain-doc';
import { RichDocOTActionName, type RichDocOTOperation } from '@searsuite/sear-domain-ot';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { DocInputTransactionMeta } from '@searsuite/sear-assembly-doc';

/** Layout work selected by the presentation consumer after a document commit. */
export enum DocRenderOperationType {
  Reflow = 'reflow',
  Repaint = 'repaint',
}

/** Render-facing operation derived from a RichDoc OT operation. */
export interface DocRenderOperation {
  readonly type: DocRenderOperationType;
  readonly ot: RichDocOTOperation;
}

/** Render operations derived from document transactions, or null when they cannot be converted safely. */
export type DocRenderOperations = readonly DocRenderOperation[] | null;

/** Dirty block ids extracted from document render operations, or null when reflow cannot be localized safely. */
export type DocRenderDirtyBlockIds = ReadonlySet<DocNodeId> | null;

/** Collects render operations derived from committed RichDoc OT transactions. */
export function collectDocRenderOperations(transactions: readonly Transaction[]): DocRenderOperations {
  const renderOperations: DocRenderOperation[] = [];
  for (const transaction of transactions) {
    const changedStyles = transaction.getMeta<readonly string[]>(DocInputTransactionMeta.ChangedInlineStyles);
    const type =
      changedStyles?.length && changedStyles.every((key) => key === 'color')
        ? DocRenderOperationType.Repaint
        : DocRenderOperationType.Reflow;
    for (const operation of transaction.operations) {
      const renderOperation = createDocRenderOperation(operation, type ?? DocRenderOperationType.Reflow);
      if (!renderOperation) return null;
      renderOperations.push(renderOperation);
    }
  }
  return renderOperations;
}

/** Collects blocks whose layout cache must be refreshed for reflow operations. */
export function collectDocReflowBlockIds(
  renderOperations: DocRenderOperations,
  document: readonly RichDocNode[],
): DocRenderDirtyBlockIds {
  if (renderOperations === null) return null;
  const blockIds = new Set<DocNodeId>();
  for (const operation of renderOperations) {
    if (operation.type !== DocRenderOperationType.Reflow) continue;
    if (isTopLevelStructureOperation(operation.ot)) return null;
    const blockId = resolveOperationBlockId(operation.ot, document);
    if (!blockId) return null;
    blockIds.add(blockId);
  }
  return blockIds;
}

/** Collects blocks whose render nodes must be repainted without invalidating layout cache. */
export function collectDocRepaintBlockIds(
  renderOperations: DocRenderOperations,
  document: readonly RichDocNode[],
): ReadonlySet<DocNodeId> {
  const blockIds = new Set<DocNodeId>();
  if (renderOperations === null) return blockIds;
  for (const operation of renderOperations) {
    if (operation.type !== DocRenderOperationType.Repaint) continue;
    const blockId = resolveOperationBlockId(operation.ot, document);
    if (blockId) blockIds.add(blockId);
  }
  return blockIds;
}

function createDocRenderOperation(operation: unknown, type: DocRenderOperationType): DocRenderOperation | null {
  if (!isRichDocOperation(operation)) return null;
  return { type, ot: operation };
}

function resolveOperationBlockId(operation: RichDocOTOperation, document: readonly RichDocNode[]): DocNodeId | null {
  const blockIndex = operation.p[0];
  if (!Number.isInteger(blockIndex)) return null;
  const block = document[blockIndex as number];
  return block ? resolveDocNodeId(block, [blockIndex as number]) : null;
}

function isRichDocOperation(operation: unknown): operation is RichDocOTOperation {
  if (!isRecord(operation) || !Array.isArray(operation['p'])) return false;
  return Object.values(RichDocOTActionName).some((action) => action in operation);
}

function isTopLevelStructureOperation(operation: RichDocOTOperation): boolean {
  if (operation.p.length !== 1) return false;
  return (
    RichDocOTActionName.NodeInsert in operation ||
    RichDocOTActionName.NodeDelete in operation ||
    RichDocOTActionName.NodeMove in operation
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
