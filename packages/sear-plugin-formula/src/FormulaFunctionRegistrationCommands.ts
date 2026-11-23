import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';

/** Removes one function contribution through its Sheet owner. */
export const UnregisterSheetFormulaFunctionCommand =
  defineSheetCommand<number>('sheet.formula.function.unregister');

export function registerSheetFormulaFunctionCommands(commands: SheetCommandBus, functions: IFunctionRegistry): void {
  commands.register(UnregisterSheetFormulaFunctionCommand, (id) =>
    new LocalActionCommand(UnregisterSheetFormulaFunctionCommand.id, () => functions.unregisterRegistration(id)));
}
