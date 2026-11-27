import { createTransaction } from '@searsuite/sear-domain-transaction';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { PublishSheetDisplayedValueChangesCommand } from '@searsuite/sear-assembly-commands';
import { WorkbookFormulaCompanionSheetPlugin } from '@searsuite/sear-assembly-workbook-kernel';

describe('WorkbookFormulaCompanionSheetPlugin', () => {
  it('forwards committed Sheet data only within its Sheet command', () => {
    const observeSheetTransaction = jest.fn();
    const plugin = new WorkbookFormulaCompanionSheetPlugin({ observeSheetTransaction } as never, 'sheet-1', {
      subscribe: jest.fn(() => () => void 0),
    } as never);
    const transaction = createTransaction(SheetDataPlugin.pluginKey);

    expect(() => plugin.onTransactionCommitted(transaction)).toThrow('editor.commands.run');
    let executing = false;
    plugin.initialize({ runtime: { commands: { isExecuting: () => executing } } } as never);
    Object.assign(plugin, { isSheetCommandExecuting: () => true, sheetId: 'forged' });
    expect(() => plugin.initialize({ runtime: { commands: { isExecuting: () => true } } } as never)).toThrow(
      'already bound',
    );
    expect(() => plugin.onTransactionCommitted(transaction)).toThrow('editor.commands.run');
    expect(observeSheetTransaction).not.toHaveBeenCalled();

    executing = true;
    plugin.onTransactionCommitted(transaction);
    expect(observeSheetTransaction).toHaveBeenCalledWith('sheet-1', transaction);
  });

  it('publishes only local structural formula results through the Sheet command', () => {
    let notify: ((cells: readonly { sheetId: string; row: number; col: number }[]) => void) | undefined;
    const dispose = jest.fn();
    const run = jest.fn();
    const plugin = new WorkbookFormulaCompanionSheetPlugin({} as never, 'sheet-1', {
      subscribe: jest.fn((_definition, listener) => {
        notify = listener;
        return dispose;
      }),
    } as never);
    plugin.initialize({ runtime: { commands: { isExecuting: () => false, run } } } as never);

    notify?.([
      { sheetId: 'sheet-1', row: 0, col: 1 },
      { sheetId: 'sheet-2', row: 2, col: 3 },
    ]);
    expect(run).toHaveBeenCalledWith(PublishSheetDisplayedValueChangesCommand, [{ row: 0, column: 1 }]);
    plugin.onEditorDestroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
