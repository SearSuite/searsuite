import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type CellKey } from '@searsuite/sear-domain-formula-engine';
import { type RecalcScheduler } from './RecalcScheduler';

/** Marks formula dependencies dirty after an external result or function changes. */
export const MarkFormulaDirtyCommand = defineSheetCommand<readonly CellKey[]>('sheet.formula.markDirty');
/** Executes one scheduled, time-bounded formula calculation batch. */
export const RunFormulaBatchCommand = defineSheetCommand<void>('sheet.formula.runBatch');
/** Resumes pending formula work when the visible viewport changes. */
export const ResumeFormulaWorkCommand = defineSheetCommand<void>('sheet.formula.resume');
/** Invalidates an obsolete formula calculation generation. */
export const DiscardFormulaWorkCommand = defineSheetCommand<void>('sheet.formula.discard');

/** Registers derived formula-state transitions on the editor-local command bus. */
export function registerFormulaRecalculationCommands(commands: SheetCommandBus, scheduler: RecalcScheduler): void {
  commands.register(MarkFormulaDirtyCommand, (keys) =>
    new LocalActionCommand(MarkFormulaDirtyCommand.id, () => scheduler.markDirty([...keys])));
  commands.register(RunFormulaBatchCommand, () =>
    new LocalActionCommand(RunFormulaBatchCommand.id, () => scheduler.processScheduledBatch()));
  commands.register(ResumeFormulaWorkCommand, () =>
    new LocalActionCommand(ResumeFormulaWorkCommand.id, () => scheduler.resumePendingWork()));
  commands.register(DiscardFormulaWorkCommand, () =>
    new LocalActionCommand(DiscardFormulaWorkCommand.id, () => scheduler.discardPendingWork()));
  scheduler.bindCommandBus(commands);
}
