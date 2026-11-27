import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
import { Injectable } from '@searsuite/sear-foundation-di';
import { FormulaNodeKind, type Dependency } from '@searsuite/sear-domain-formula-engine';
import {
  FormulaCrossSheetHighlightSource,
  GetFormulaCellStatusCommand,
  type FormulaCrossSheetReference,
} from '@searsuite/sear-plugin-formula';
import { GetActiveCell, SheetSelectionSource } from '@searsuite/sear-plugin-selection';
import { ActivateWorkbookSheetCommand } from '../../WorkbookCommands';
import {
  WorkbookPlugin,
  type WorkbookCompanionSheetService,
  type WorkbookPluginContext,
} from '../../WorkbookPluginContracts';

/** Keeps the selected formula's qualified references visible during a workbook sheet switch. */
@Injectable()
export class WorkbookFormulaCrossSheetHighlightPlugin
  extends WorkbookPlugin
  implements FormulaCrossSheetHighlightSource
{
  public static readonly symbol = Symbol.for('WorkbookFormulaCrossSheetHighlightPlugin');
  #context: WorkbookPluginContext | null = null;
  #snapshot: {
    sourceId: string;
    dependencies: readonly Dependency[];
    targetId: string | null;
    selectionRevision: number | null;
  } | null = null;

  public getSheetServices(): readonly WorkbookCompanionSheetService[] {
    return [{ token: FormulaCrossSheetHighlightSource.symbol, value: this }];
  }

  public initialize(context: WorkbookPluginContext): () => void {
    this.#context = context;
    const unsubscribe = context.runtime.commands.subscribe((event) => {
      if (event.id === ActivateWorkbookSheetCommand.id && event.phase === CommandExecutionPhase.Started) {
        this.#captureSelectedFormula();
      }
    });
    return () => {
      unsubscribe();
      this.#snapshot = null;
      this.#context = null;
    };
  }

  public getReferences(selectionRevision: number, selectionSource?: string): readonly FormulaCrossSheetReference[] {
    const snapshot = this.#snapshot;
    const runtime = this.#context?.runtime;
    if (!snapshot || !runtime) return [];
    const targetId = runtime.sheets.getActiveId();
    if (targetId === snapshot.sourceId) return [];
    if (snapshot.targetId !== targetId) {
      snapshot.targetId = targetId;
      snapshot.selectionRevision = selectionRevision;
    } else if (snapshot.selectionRevision !== selectionRevision) {
      if (selectionSource === SheetSelectionSource.Pointer || selectionSource === SheetSelectionSource.Keyboard) {
        this.#snapshot = null;
        return [];
      }
      snapshot.selectionRevision = selectionRevision;
    }
    const target = runtime.document.getState().sheets.find((sheet) => sheet.id === targetId);
    if (!target) return [];
    return snapshot.dependencies.flatMap((dependency, index) => {
      if (
        dependency.kind === FormulaNodeKind.WorkbookCell &&
        dependency.sheetName.toUpperCase() === target.name.toUpperCase()
      ) {
        return [
          {
            start: [dependency.row, dependency.col],
            end: [dependency.row, dependency.col],
            index,
          } satisfies FormulaCrossSheetReference,
        ];
      }
      if (
        dependency.kind === FormulaNodeKind.WorkbookRange &&
        dependency.sheetName.toUpperCase() === target.name.toUpperCase()
      ) {
        return [{ start: dependency.start, end: dependency.end, index } satisfies FormulaCrossSheetReference];
      }
      return [];
    });
  }

  #captureSelectedFormula(): void {
    const runtime = this.#context?.runtime;
    if (!runtime) return;
    if (this.#snapshot && runtime.sheets.getActiveId() !== this.#snapshot.sourceId) return;
    this.#snapshot = null;
    const editor = runtime.sheets.getActiveClient();
    if (!editor.queries.has(GetActiveCell) || !editor.commands.has(GetFormulaCellStatusCommand)) return;
    const cell = editor.queries.run(GetActiveCell, void 0);
    if (!cell) return;
    const status = editor.commands.run(GetFormulaCellStatusCommand, { row: cell[0], col: cell[1] }).status;
    if (
      !status.isFormulaCell ||
      !status.dependencies.some(
        (dependency) =>
          dependency.kind === FormulaNodeKind.WorkbookCell || dependency.kind === FormulaNodeKind.WorkbookRange,
      )
    )
      return;
    this.#snapshot = {
      sourceId: runtime.sheets.getActiveId(),
      dependencies: status.dependencies,
      targetId: null,
      selectionRevision: null,
    };
  }
}
