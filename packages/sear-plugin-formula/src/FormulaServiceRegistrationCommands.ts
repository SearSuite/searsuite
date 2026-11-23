import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type IFormulaExternalServiceProvider, type IFormulaTextServiceProvider } from '@searsuite/sear-domain-formula-engine';

/** Removes one Sheet-owned external formula service contribution. */
export const UnregisterSheetFormulaExternalServiceCommand =
  defineSheetCommand<number>('sheet.formula.externalService.unregister');
/** Removes one Sheet-owned formula text service contribution. */
export const UnregisterSheetFormulaTextServiceCommand =
  defineSheetCommand<number>('sheet.formula.textService.unregister');

export function registerSheetFormulaServiceCommands(
  commands: SheetCommandBus,
  externalServices: IFormulaExternalServiceProvider,
  textServices: IFormulaTextServiceProvider,
): void {
  commands.register(UnregisterSheetFormulaExternalServiceCommand, (id) =>
    new LocalActionCommand(UnregisterSheetFormulaExternalServiceCommand.id, () =>
      externalServices.unregisterRegistration(id)));
  commands.register(UnregisterSheetFormulaTextServiceCommand, (id) =>
    new LocalActionCommand(UnregisterSheetFormulaTextServiceCommand.id, () =>
      textServices.unregisterRegistration?.(id)));
}
