import { defineSheetCommand, type SheetCommandBus, type SheetCommandResult } from '@searsuite/sear-assembly-commands';
import { FormulaNodeKind, type FormulaCellStatus, type IFormulaStatusProvider } from '@searsuite/sear-domain-formula-engine';
import { FormulaCellStatusQueryCommand } from './FormulaCellStatusQueryCommand';
import { FormulaDependencyStatusQueryCommand } from './FormulaDependencyStatusQueryCommand';
import { FormulaIdleWaitCommand } from './FormulaIdleWaitCommand';

/** Input for querying one cell's formula status through the host command bus. */
export interface FormulaCellStatusCommandInput {
  /** Row index (0-based). */
  readonly row: number;
  /** Column index (0-based). */
  readonly col: number;
}

/**
 * Command result for a formula status query.
 *
 * The pipeline is intentionally empty: formula status reads must not mutate OT
 * state, request rendering, or produce local effects.
 */
export interface FormulaCellStatusCommandResult extends SheetCommandResult {
  /** Formula status snapshot returned by the formula status provider. */
  readonly status: FormulaCellStatus;
}

/** Host command that reads one cell's formula status. */
export const GetFormulaCellStatusCommand = defineSheetCommand<
  FormulaCellStatusCommandInput,
  FormulaCellStatusCommandResult
>('formula.getCellStatus');

/** Product-facing cell coordinate plus A1 reference label. */
export interface FormulaDependencyCellRef {
  /** Row index (0-based). */
  readonly row: number;
  /** Column index (0-based). */
  readonly col: number;
  /** A1 notation for display in product UI. */
  readonly ref: string;
}

/** Product-facing dependency edge that preserves range-level formula semantics. */
export type FormulaDependencyReference =
  | (FormulaDependencyCellRef & {
      /** Single-cell dependency. */
      readonly kind: typeof FormulaNodeKind.Cell;
    })
  | {
      /** Rectangular range dependency. */
      readonly kind: typeof FormulaNodeKind.Range;
      /** Start cell of the range. */
      readonly start: FormulaDependencyCellRef;
      /** End cell of the range. */
      readonly end: FormulaDependencyCellRef;
      /** A1 range label such as A1:C3. */
      readonly ref: string;
    }
  | (FormulaDependencyCellRef & {
      /** Workbook-qualified single-cell dependency. */
      readonly kind: typeof FormulaNodeKind.WorkbookCell;
      /** Display sheet name from the formula source. */
      readonly sheetName: string;
    })
  | {
      /** Workbook-qualified rectangular range dependency. */
      readonly kind: typeof FormulaNodeKind.WorkbookRange;
      /** Display sheet name from the formula source. */
      readonly sheetName: string;
      /** Start cell of the range. */
      readonly start: FormulaDependencyCellRef;
      /** End cell of the range. */
      readonly end: FormulaDependencyCellRef;
      /** Workbook-qualified display label such as Sheet2!A1:C3. */
      readonly ref: string;
    }
  | {
      /** Whole-column dependency. */
      readonly kind: typeof FormulaNodeKind.ColumnRange;
      /** Start column index (0-based). */
      readonly startCol: number;
      /** End column index (0-based). */
      readonly endCol: number;
      /** A1 column range label such as A:C. */
      readonly ref: string;
    }
  | {
      /** Whole-row dependency. */
      readonly kind: typeof FormulaNodeKind.RowRange;
      /** Start row index (0-based). */
      readonly startRow: number;
      /** End row index (0-based). */
      readonly endRow: number;
      /** A1 row range label such as 1:3. */
      readonly ref: string;
    };

/** Input for querying product-facing formula dependency status. */
export interface FormulaDependencyStatusCommandInput {
  /** Row index (0-based). */
  readonly row: number;
  /** Column index (0-based). */
  readonly col: number;
  /** Whether to include transitive dependency/dependent cells beyond direct edges. */
  readonly includeTransitive?: boolean;
  /** Maximum traversal depth used when includeTransitive is true. Defaults to 8. */
  readonly maxDepth?: number;
}

/** Product-facing formula dependency status for one queried cell. */
export interface FormulaDependencyStatus {
  /** Queried cell with display label. */
  readonly cell: FormulaDependencyCellRef;
  /** Underlying formula status snapshot for consumers that need result/error/dirty details. */
  readonly status: FormulaCellStatus;
  /** Direct precedent references used by the formula in the queried cell. */
  readonly precedents: readonly FormulaDependencyReference[];
  /** Direct formula cells that depend on the queried cell. */
  readonly dependents: readonly FormulaDependencyCellRef[];
  /** Transitive precedent cells, only populated when requested. */
  readonly transitivePrecedents: readonly FormulaDependencyCellRef[];
  /** Transitive dependent formula cells, only populated when requested. */
  readonly transitiveDependents: readonly FormulaDependencyCellRef[];
}

/**
 * Command result for a product-facing formula dependency query.
 *
 * The pipeline is intentionally empty: dependency reads must not mutate OT state,
 * request rendering, or produce local effects.
 */
export interface FormulaDependencyStatusCommandResult extends SheetCommandResult {
  /** Product-facing dependency snapshot for the queried cell. */
  readonly dependencyStatus: FormulaDependencyStatus;
}

/** Host command that reads product-facing formula dependency status. */
export const GetFormulaDependencyStatusCommand = defineSheetCommand<
  FormulaDependencyStatusCommandInput,
  FormulaDependencyStatusCommandResult
>('formula.getDependencyStatus');

/** Provider contract used by the deterministic formula-idle command. */
export interface FormulaIdleProvider {
  /** Resolves after all currently scheduled formula work has completed. */
  waitForIdle(): Promise<void>;
}

/** Result returned when waiting for one editor instance's formula scheduler. */
export interface FormulaIdleCommandResult extends SheetCommandResult {
  /** Promise resolved when the formula scheduler becomes idle. */
  readonly idle: Promise<void>;
}

/** Host command that exposes deterministic formula-idle synchronization. */
export const WaitForFormulaIdleCommand = defineSheetCommand<void, FormulaIdleCommandResult>('formula.waitForIdle');

/**
 * Registers formula status query commands.
 * @param commands - Command bus for one editor instance.
 * @param provider - Formula status provider bound to the same editor instance.
 */
export function registerFormulaStatusCommands(
  commands: SheetCommandBus,
  provider: IFormulaStatusProvider,
  idleProvider?: FormulaIdleProvider,
): void {
  commands.register(GetFormulaCellStatusCommand, function createFormulaCellStatusCommand(input) {
    return new FormulaCellStatusQueryCommand(provider, input);
  });
  commands.register(GetFormulaDependencyStatusCommand, function createFormulaDependencyStatusCommand(input) {
    return new FormulaDependencyStatusQueryCommand(provider, input);
  });
  if (idleProvider) {
    commands.register(WaitForFormulaIdleCommand, () => new FormulaIdleWaitCommand(idleProvider));
  }
}

/** Waits deterministically for one editor's formula scheduler to become idle. */
export function waitForFormulaIdle(commands: SheetCommandBus): Promise<void> {
  return commands.run(WaitForFormulaIdleCommand, void 0).idle;
}
