import { Injectable } from '@searsuite/sear-foundation-di';
import { runOutsideCommandExecution } from '@searsuite/sear-assembly-core';
import { SearError } from '@searsuite/sear-foundation-error';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import type { WorkbookCommandBus } from '../../WorkbookCommandBus';
import { defineWorkbookCommand } from '../../WorkbookCommandDefinition';
import { WorkbookPlugin, type WorkbookPluginContext } from '../../WorkbookPluginContracts';
import { WorkbookHistoryAction, WorkbookTransaction } from '../../WorkbookTransaction';
import {
  WorkbookFormulaObjectsMetadataKey,
  type WorkbookFormulaObjects,
  type WorkbookFormulaTable,
} from '../../WorkbookFormulaObjects';

export interface SetWorkbookDefinedNameInput {
  readonly name: string;
  readonly formula: string;
}

export const SetWorkbookDefinedNameCommand =
  defineWorkbookCommand<SetWorkbookDefinedNameInput>('workbookFormula.setDefinedName');
export const RemoveWorkbookDefinedNameCommand =
  defineWorkbookCommand<{ readonly name: string }>('workbookFormula.removeDefinedName');
export const SetWorkbookFormulaTableCommand =
  defineWorkbookCommand<WorkbookFormulaTable>('workbookFormula.setTable');
export const RemoveWorkbookFormulaTableCommand =
  defineWorkbookCommand<{ readonly name: string }>('workbookFormula.removeTable');
export const WorkbookFormulaObjectsObservation =
  defineStateObservation<WorkbookFormulaObjects>('workbookFormula.objects');

/** Workbook-owned editing surface for named formulas and table references. */
@Injectable()
export class WorkbookFormulaObjectsPlugin extends WorkbookPlugin {
  public static readonly symbol = Symbol.for('WorkbookFormulaObjectsPlugin');

  private readonly parser = new FormulaParser();
  private readonly listeners = new Set<(value: WorkbookFormulaObjects) => void>();
  #runtime: WorkbookPluginContext['runtime'] | null = null;
  private observedObjects: WorkbookFormulaObjects | undefined;

  public registerCommands(commands: WorkbookCommandBus): void {
    commands.register(SetWorkbookDefinedNameCommand, (input) => this.setDefinedName(input));
    commands.register(RemoveWorkbookDefinedNameCommand, (input) => this.updateObjects('removeDefinedName', (objects) => {
      const names = Object.fromEntries(Object.entries(objects.names ?? {}).filter(([name]) => name.toUpperCase() !== input.name.toUpperCase()));
      return { ...objects, names };
    }));
    commands.register(SetWorkbookFormulaTableCommand, (input) => this.setTable(input));
    commands.register(RemoveWorkbookFormulaTableCommand, (input) => this.updateObjects('removeTable', (objects) => ({
      ...objects,
      tables: (objects.tables ?? []).filter((table) => table.name.toUpperCase() !== input.name.toUpperCase()),
    })));
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(WorkbookFormulaObjectsObservation, {
      getSnapshot: () => this.getObjects(),
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    });
  }

  public initialize(context: WorkbookPluginContext): void {
    this.#runtime = context.runtime;
    this.observedObjects = this.getObjects();
  }

  public onTransactionCommitted(): void {
    if (!this.#runtime) return;
    if (!this.#runtime.commands.isExecuting()) {
      throw new SearError('Workbook formula changes must run through editor.commands.run(...).');
    }
    const objects = this.getObjects();
    if (objects === this.observedObjects) return;
    this.observedObjects = objects;
    this.emit();
  }

  public onWorkbookDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#runtime = null;
    this.observedObjects = undefined;
    this.listeners.clear();
  }

  private setDefinedName(input: SetWorkbookDefinedNameInput) {
    const name = input.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) || /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]*$/.test(name)) {
      throw new SearError('Invalid workbook defined name.');
    }
    this.parser.parse(input.formula);
    return this.updateObjects('setDefinedName', (objects) => ({
      ...objects,
      names: {
        ...Object.fromEntries(Object.entries(objects.names ?? {}).filter(([existing]) => existing.toUpperCase() !== name.toUpperCase())),
        [name]: input.formula,
      },
    }));
  }

  private setTable(input: WorkbookFormulaTable) {
    const state = this.requireRuntime().document.getState();
    const sheet = state.sheets.find((entry) => entry.name.toUpperCase() === input.sheet.toUpperCase());
    if (!sheet || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(input.name)) {
      throw new SearError('Invalid workbook formula table.');
    }
    const range = this.parser.parse(`=${input.range}`);
    if (range.kind !== FormulaNodeKind.Range) throw new SearError('Formula table range must be a cell range.');
    return this.updateObjects('setTable', (objects) => ({
      ...objects,
      tables: [...(objects.tables ?? []).filter((table) => table.name.toUpperCase() !== input.name.toUpperCase()), input],
    }));
  }

  private updateObjects(action: string, update: (objects: WorkbookFormulaObjects) => WorkbookFormulaObjects) {
    const runtime = this.requireRuntime();
    const transaction = new WorkbookTransaction(`workbookFormula.${action}`, WorkbookHistoryAction.Record);
    transaction.addStep(`workbookFormula.${action}:metadata`, (state) => {
      const objects = state.documentState.metadata?.[WorkbookFormulaObjectsMetadataKey] as WorkbookFormulaObjects | undefined;
      return {
        ...state,
        documentState: {
          ...state.documentState,
          metadata: {
            ...state.documentState.metadata,
            [WorkbookFormulaObjectsMetadataKey]: update(objects ?? {}),
          },
        },
      };
    });
    return runtime.executeTransaction(transaction);
  }

  private getObjects(): WorkbookFormulaObjects {
    return (this.#runtime?.document.getState().metadata?.[WorkbookFormulaObjectsMetadataKey] as WorkbookFormulaObjects | undefined) ?? {};
  }

  private emit(): void {
    const value = this.getObjects();
    runOutsideCommandExecution(() => this.listeners.forEach((listener) => listener(value)));
  }

  private requireRuntime(): WorkbookPluginContext['runtime'] {
    if (!this.#runtime) throw new SearError('WorkbookFormulaObjectsPlugin has not been initialized.');
    return this.#runtime;
  }
}
