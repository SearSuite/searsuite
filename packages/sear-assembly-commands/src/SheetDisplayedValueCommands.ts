import { defineSheetCommand } from './SheetCommandDefinition';
import { LocalActionCommand } from './transactionCommands/LocalActionCommand';
import { type SheetCommandBus } from './SheetCommandBus';
import { SheetDisplayedValueChanges, type SheetDisplayedValueCoordinate } from '@searsuite/sear-domain-cell-types';

/** Publishes derived display changes through the owning Sheet command bus. */
export const PublishSheetDisplayedValueChangesCommand = defineSheetCommand<readonly SheetDisplayedValueCoordinate[]>(
  'sheet.displayedValues.publish',
);

export function registerSheetDisplayedValueCommands(
  commands: SheetCommandBus,
  changes: SheetDisplayedValueChanges,
): void {
  commands.register(
    PublishSheetDisplayedValueChangesCommand,
    (cells) => new LocalActionCommand(PublishSheetDisplayedValueChangesCommand.id, () => changes.publish(cells)),
  );
}
