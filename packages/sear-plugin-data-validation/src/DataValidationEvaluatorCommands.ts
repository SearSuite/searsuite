import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type DataValidationEvaluatorRegistry } from './DataValidationEvaluatorRegistry';

/** Removes one editor-local external data-validation evaluator. */
export const UnregisterDataValidationEvaluatorCommand =
  defineSheetCommand<number>('sheet.dataValidation.evaluator.unregister');

/** Binds evaluator disposal to the data-validation owner's command. */
export function registerDataValidationEvaluatorCommands(
  commands: SheetCommandBus,
  evaluators: DataValidationEvaluatorRegistry,
): void {
  commands.register(UnregisterDataValidationEvaluatorCommand, (id) =>
    new LocalActionCommand(UnregisterDataValidationEvaluatorCommand.id, () => evaluators.unregister(id)));
}
