import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { SheetHorizontalAlignment, assertSheetHorizontalAlignment } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import {
  forEachAlignmentCell,
  normalizeAlignmentCommandRange,
  type AlignmentCommandRangeDataSource,
} from '../AlignmentCommandRange';

/** Public command for setting horizontal alignment in a range. */
export const SetRangeAlignmentCommand = defineSheetCommand<SheetSetRangeAlignmentInput>('range.setAlignment');

/** Public input for setting horizontal alignment in one or more ranges. */
export type SheetSetRangeAlignmentInput =
  | (SheetRangeInput & { readonly alignment: SheetHorizontalAlignment })
  | { readonly ranges: readonly SheetRangeInput[]; readonly alignment: SheetHorizontalAlignment };

/** State access required by the horizontal alignment command. */
export interface SheetHorizontalAlignmentCommandDataSource extends AlignmentCommandRangeDataSource {
  readonly target: PluginKey;
  readCellAlignment(row: number, column: number): SheetHorizontalAlignment | null;
}

type SheetHorizontalAlignmentReader = AlignmentCommandRangeDataSource &
  Pick<SheetHorizontalAlignmentCommandDataSource, 'readCellAlignment'>;

/** Registers the horizontal alignment command owned by SheetAlignmentPlugin. */
export function registerSheetHorizontalAlignmentCommand(
  commands: SheetCommandBus,
  dataSource: SheetHorizontalAlignmentCommandDataSource,
): void {
  commands.register(
    SetRangeAlignmentCommand,
    (input) =>
      new TransactionPipelineCommand(
        SetRangeAlignmentCommand.id,
        createSheetTransaction(dataSource.target, createSetRangeAlignmentOperations(input, dataSource)),
      ),
  );
}

/** Creates sparse UpdateCell operations for horizontal alignment. */
export function createSetRangeAlignmentOperations(
  input: SheetSetRangeAlignmentInput,
  dataSource: SheetHorizontalAlignmentReader,
): UpdateCellOTOperation<SheetHorizontalAlignment>[] {
  assertSheetHorizontalAlignment(input.alignment);
  const ranges = ('ranges' in input ? input.ranges : [input]).map((range) =>
    normalizeAlignmentCommandRange(range, dataSource),
  );
  const value = input.alignment === SheetHorizontalAlignment.Left ? null : input.alignment;
  const operations: UpdateCellOTOperation<SheetHorizontalAlignment>[] = [];
  const seen = new Set<string>();
  ranges.forEach((range) => {
    forEachAlignmentCell(range, (row, column) => {
      const key = `${row}:${column}`;
      if (seen.has(key)) return;
      seen.add(key);
      operations.push(createUpdateCellOTOperation([row, column], value, dataSource.readCellAlignment(row, column)));
    });
  });
  return operations;
}
