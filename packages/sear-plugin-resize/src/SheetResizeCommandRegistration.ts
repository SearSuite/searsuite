import { LocalActionCommand, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import {
  registerSheetResizeDimensionCommands,
  type SheetResizeDimensionCommandDataSource,
} from './SheetResizeDimensionCommands';
import {
  BeginSheetResizeDragCommand,
  EndSheetResizeDragCommand,
  UpdateSheetResizeDragCommand,
  type SheetBeginResizeDragInput,
  type SheetUpdateResizeDragInput,
} from './SheetResizeCommands';

/** Resize drag-session state controller owned by SheetResizePlugin. */
export interface SheetResizeDragCommandController {
  beginResizeDrag(input: SheetBeginResizeDragInput): void;
  updateResizeDrag(input: SheetUpdateResizeDragInput): void;
  endResizeDrag(): void;
}

/**
 * Registers resize drag-session command factories on one editor command bus.
 * @param commands - Command bus owned by the current sheet editor.
 * @param controller - Resize plugin controller that owns local drag-session state.
 */
export function registerSheetResizeDragCommands(
  commands: SheetCommandBus,
  controller: SheetResizeDragCommandController,
): void {
  commands.register(BeginSheetResizeDragCommand, function createBeginSheetResizeDragCommand(input) {
    return new LocalActionCommand(BeginSheetResizeDragCommand.id, function beginResizeDrag(): void {
      controller.beginResizeDrag(input);
    });
  });
  commands.register(UpdateSheetResizeDragCommand, function createUpdateSheetResizeDragCommand(input) {
    return new LocalActionCommand(UpdateSheetResizeDragCommand.id, function updateResizeDrag(): void {
      controller.updateResizeDrag(input);
    });
  });
  commands.register(EndSheetResizeDragCommand, function createEndSheetResizeDragCommand() {
    return new LocalActionCommand(EndSheetResizeDragCommand.id, function endResizeDrag(): void {
      controller.endResizeDrag();
    });
  });
}

/**
 * Registers the complete command surface owned by SheetResizePlugin.
 * @param commands - Command bus owned by the current sheet editor.
 * @param dataSource - Resize state reader used by semantic dimension commands.
 */
export function registerSheetResizeCommands(
  commands: SheetCommandBus,
  dataSource: SheetResizeDimensionCommandDataSource,
  controller: SheetResizeDragCommandController,
): void {
  registerSheetResizeDragCommands(commands, controller);
  registerSheetResizeDimensionCommands(commands, dataSource);
}
