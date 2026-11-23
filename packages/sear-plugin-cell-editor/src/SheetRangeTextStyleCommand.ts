import { createSheetTransaction, defineSheetCommand, TransactionPipelineCommand, type SheetCommandBus, type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { stringToRichDoc } from '@searsuite/sear-domain-doc';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { GetSelections } from '@searsuite/sear-plugin-selection';
import { ReadSheetCellDataQuery, SheetDataPlugin } from '@searsuite/sear-render-engine';
import { type SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';

export interface SheetRangeTextStyleInput {
  readonly attrs: Readonly<Record<string, unknown>>;
}

/** Applies text styles to the complete content of selected text cells. */
export const SetRangeCellTextStyleCommand = defineSheetCommand<SheetRangeTextStyleInput>('range.setCellTextStyle');

export function registerSheetRangeTextStyleCommand(
  commands: SheetCommandBus,
  queries: SheetQueryRegistry,
  embeddedEditor: SheetEmbeddedEditor | null | undefined,
): void {
  if (!embeddedEditor?.formatting) return;
  commands.register(SetRangeCellTextStyleCommand, (input) => {
    const data = queries.run(ReadSheetCellDataQuery, void 0);
    const ranges = queries.run(GetSelections, void 0);
    const operations: ReturnType<typeof createUpdateCellOTOperation<CellMatrixElement>>[] = [];
    const seen = new Set<string>();
    const applyCell = (previous: CellMatrixElement, row: number, col: number): void => {
      const key = `${row}:${col}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (previous.type !== CellType.String && previous.type !== CellType.RichText) return;
      const document = typeof previous.value === 'string'
        ? stringToRichDoc(previous.value)
        : Array.isArray(previous.value) ? previous.value : null;
      if (!document) return;
      const current = embeddedEditor.formatting!.capture(document);
      const next = embeddedEditor.formatting!.apply(document, { ...current, ...input.attrs });
      const value: CellMatrixElement = { type: CellType.RichText, value: next };
      operations.push(createUpdateCellOTOperation<CellMatrixElement>([row, col], value, previous));
    };
    for (const range of ranges) {
      if (data.forEachStoredInRange) {
        data.forEachStoredInRange(...range.start, ...range.end, applyCell);
        continue;
      }
      for (let row = range.start[0]; row <= range.end[0]; row += 1) {
        for (let col = range.start[1]; col <= range.end[1]; col += 1) {
          const previous = data.getItem(row, col);
          if (previous) applyCell(previous, row, col);
        }
      }
    }
    return new TransactionPipelineCommand(SetRangeCellTextStyleCommand.id,
      createSheetTransaction(SheetDataPlugin.pluginKey, operations));
  });
}
