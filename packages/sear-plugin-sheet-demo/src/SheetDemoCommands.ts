import {
  createSheetTransaction, defineSheetCommand, defineSheetQuery, SheetCommandBus, SheetQueryRegistry,
  TransactionPipelineCommand,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetDemoMatrix } from './SheetDemoMatrix';
import { assertSheetDemoMarker, type SheetDemoMarker } from './SheetDemoMarker';

export interface SheetDemoCellInput {
  readonly row: number;
  readonly column: number;
}

export interface SetSheetDemoMarkerInput extends SheetDemoCellInput {
  readonly marker: SheetDemoMarker | null;
}

export const SetSheetDemoMarkerCommand = defineSheetCommand<SetSheetDemoMarkerInput>('sheetDemo.setMarker');
export const ReadSheetDemoMarkerQuery = defineSheetQuery<SheetDemoCellInput, SheetDemoMarker | null>('sheetDemo.readMarker');

export interface SheetDemoCommandSource {
  readonly target: PluginKey;
  readMatrix(): SheetDemoMatrix;
}

export function registerSheetDemoCommands(commands: SheetCommandBus, source: SheetDemoCommandSource): void {
  commands.register(SetSheetDemoMarkerCommand, (input) => {
    const matrix = source.readMatrix();
    assertCellInBounds(input, matrix);
    if (input.marker !== null) assertSheetDemoMarker(input.marker);
    const previous = matrix.getItem(input.row, input.column);
    const operations = previous === input.marker ? [] : [
      createUpdateCellOTOperation([input.row, input.column], input.marker, previous),
    ];
    return new TransactionPipelineCommand(
      SetSheetDemoMarkerCommand.id,
      createSheetTransaction(source.target, operations),
    );
  });
}

export function registerSheetDemoQueries(queries: SheetQueryRegistry, readMatrix: () => SheetDemoMatrix): void {
  queries.register(ReadSheetDemoMarkerQuery, (input) => {
    const matrix = readMatrix();
    assertCellInBounds(input, matrix);
    return matrix.getItem(input.row, input.column);
  });
}

function assertCellInBounds(input: SheetDemoCellInput, matrix: SheetDemoMatrix): void {
  if (!Number.isInteger(input.row) || !Number.isInteger(input.column) ||
      input.row < 0 || input.column < 0 ||
      input.row >= matrix.shape[0] || input.column >= matrix.shape[1]) {
    throw new SearError('Sheet demo cell is outside sheet bounds.', { input, shape: matrix.shape });
  }
}
