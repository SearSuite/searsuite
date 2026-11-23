import {
  createSheetTransaction,
  defineSheetCommand,
  SheetCommandBus,
  TransactionPipelineCommand,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { type CellBorderMatrix } from './CellBorderMatrix';
import { type SheetBorderPreset, type SheetBorderStroke } from './SheetCellBorder';
import { assertBorderPreset, assertBorderStroke } from './CellBorderValidation';
import { normalizeBorderRange } from './CellBorderRange';
import { planCellBorders } from './CellBorderPlanning';

/** Range-border command; all neighbor changes belong to the same transaction. */
export const SetRangeCellBorderCommand = defineSheetCommand<SheetSetRangeCellBorderInput>('range.setCellBorder');
/** Public range-border input. */
export interface SheetSetRangeCellBorderInput extends SheetRangeInput {
  readonly preset: SheetBorderPreset;
  readonly stroke: SheetBorderStroke;
}

/** Registers commands through the border owner's current matrix. */
export function registerCellBorderCommands(
  commands: SheetCommandBus,
  target: PluginKey,
  read: () => CellBorderMatrix,
): void {
  commands.register(SetRangeCellBorderCommand, (input) => {
    assertBorderPreset(input.preset);
    assertBorderStroke(input.stroke);
    const matrix = read();
    const range = normalizeBorderRange(input, matrix.shape);
    return new TransactionPipelineCommand(
      SetRangeCellBorderCommand.id,
      createSheetTransaction(target, planCellBorders(matrix, range, input.preset, input.stroke)),
    );
  });
}
