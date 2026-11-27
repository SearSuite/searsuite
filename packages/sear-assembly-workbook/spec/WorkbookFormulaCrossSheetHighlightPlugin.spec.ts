import { FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
import { GetFormulaCellStatusCommand } from '@searsuite/sear-plugin-formula';
import { GetActiveCell } from '@searsuite/sear-plugin-selection';
import { ActivateWorkbookSheetCommand } from '@searsuite/sear-assembly-workbook-kernel';
import { WorkbookFormulaCrossSheetHighlightPlugin } from '@searsuite/sear-assembly-workbook-kernel';

describe('WorkbookFormulaCrossSheetHighlightPlugin', () => {
  it('projects selected formula references only onto their target sheet and clears after selection changes', () => {
    let activeId = 'source';
    let listener: ((event: { id: string; phase: CommandExecutionPhase }) => void) | undefined;
    const editor = {
      queries: { has: (query: unknown) => query === GetActiveCell, run: () => [1, 1] },
      commands: {
        has: (command: unknown) => command === GetFormulaCellStatusCommand,
        run: () => ({
          status: {
            isFormulaCell: true,
            dependencies: [
              { kind: FormulaNodeKind.WorkbookCell, sheetName: 'Data', row: 2, col: 3 },
              { kind: FormulaNodeKind.WorkbookRange, sheetName: 'Data', start: [4, 1], end: [5, 2] },
              { kind: FormulaNodeKind.WorkbookCell, sheetName: 'Other', row: 0, col: 0 },
            ],
          },
        }),
      },
    };
    const runtime = {
      commands: {
        subscribe: (callback: typeof listener) => {
          listener = callback;
          return () => {
            listener = undefined;
          };
        },
      },
      sheets: { getActiveId: () => activeId, getActiveClient: () => editor },
      document: {
        getState: () => ({
          sheets: [
            { id: 'source', name: 'Source' },
            { id: 'data', name: 'Data' },
            { id: 'other', name: 'Other' },
          ],
        }),
      },
    };
    const plugin = new WorkbookFormulaCrossSheetHighlightPlugin();
    const dispose = plugin.initialize({ runtime } as never);
    listener?.({ id: ActivateWorkbookSheetCommand.id, phase: CommandExecutionPhase.Started });
    expect(plugin.getReferences(1)).toEqual([]);
    activeId = 'data';
    expect(plugin.getReferences(1)).toEqual([
      { start: [2, 3], end: [2, 3], index: 0 },
      { start: [4, 1], end: [5, 2], index: 1 },
    ]);
    listener?.({ id: ActivateWorkbookSheetCommand.id, phase: CommandExecutionPhase.Started });
    activeId = 'other';
    expect(plugin.getReferences(1)).toEqual([{ start: [0, 0], end: [0, 0], index: 2 }]);
    activeId = 'data';
    expect(plugin.getReferences(1)).toEqual([
      { start: [2, 3], end: [2, 3], index: 0 },
      { start: [4, 1], end: [5, 2], index: 1 },
    ]);
    expect(plugin.getReferences(2, 'pointer')).toEqual([]);
    expect(plugin.getReferences(2)).toEqual([]);
    dispose();
  });
});
