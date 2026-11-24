/** @jest-environment node */

import {
  createHeadlessEditor, type HeadlessEditor, type HeadlessEditorOptions,
  type HeadlessWorkbookEditor, type HeadlessWorkbookEditorOptions,
} from '../src';
import { defineSheetCommand, LocalActionCommand } from '@searsuite/sear-assembly-commands';
import { SheetMatrix } from '@searsuite/sear-assembly-core';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  type FormulaFunction,
  FormulaErrorCode,
  createFormulaError,
  defineFormulaExternalService,
  FormulaWebServiceDefinition,
} from '@searsuite/sear-domain-formula-engine';
import { AsyncFormulaServiceCache, FILTERXML, FormulaWebServiceCache } from '@searsuite/sear-domain-formula-engine-ts';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import {
  ActivateWorkbookSheetCommand,
  defineWorkbookCommand,
  WorkbookFormulaPlugin,
  WorkbookRuntimeCapability,
} from '@searsuite/sear-assembly-workbook';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { Injectable } from '@searsuite/sear-foundation-di';
import {
  SheetPlugin,
  SheetRuntimeCapability,
  type SheetDocumentState,
  type SheetPluginRuntimeContext,
  type SheetPluginSetupContext,
} from '@searsuite/sear-assembly-setup';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';

const scopedFunction: FormulaFunction = {
  name: 'SCOPED_INCREMENT',
  evaluate(args) {
    const value = args[0];
    if (args.length !== 1 || value.kind !== 'value' || typeof value.value !== 'number') {
      return createFormulaError(FormulaErrorCode.Value);
    }
    return value.value + 1;
  },
};

@Injectable()
class ScopedFormulaFunctionPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('ScopedFormulaFunctionPlugin');
  public static disposeCount = 0;
  public static usedFormulaCapability = false;
  private unregister: (() => void) | undefined;

  public constructor() {
    super({ key: new PluginKey('ScopedFormulaFunctionPlugin'), state: null });
  }

  public configure(context: SheetPluginSetupContext): void {
    const capability = context.runtime.extensions.require(SheetRuntimeCapability.Formula);
    ScopedFormulaFunctionPlugin.usedFormulaCapability = capability.functions === context.runtime.formula.functions;
    const unregister = capability.functions.register(scopedFunction);
    this.unregister = () => {
      unregister();
      ScopedFormulaFunctionPlugin.disposeCount++;
    };
  }

  public onEditorDestroy(_context: SheetPluginRuntimeContext): void {
    this.unregister?.();
    this.unregister = void 0;
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }
}

function createFormulaSheetState(
  formula = '=SCOPED_INCREMENT(41)',
  shape: [number, number] = [1, 1],
): SheetDocumentState {
  const sheetData = new SheetMatrix(void 0, shape);
  sheetData.addItem(0, 0, { type: CellType.Formula, formula });
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, shape[0]]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, shape[1]]);
  rowSizes.setDefaultValue(24);
  columnSizes.setDefaultValue(100);
  return {
    sheetData,
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, shape),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, shape),
    cellFills: new CellFillMatrix(void 0, shape),
    cellHighlights: new CellHighlightMatrix(void 0, shape),
    duplicates: new DuplicateMatrix(void 0, shape),
    cellFormats: new CellFormatMatrix(void 0, shape),
    rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, shape[0]]),
    columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, shape[1]]),
    cellMerges: new CellMergeMatrix(void 0, shape),
  };
}

function formulaResult(editor: HeadlessEditor) {
  return editor.commands.run(GetFormulaCellStatusCommand, { row: 0, col: 0 });
}

const RegisterSheetFormulaContributionCommand = defineSheetCommand<void>('test.formula.registerContribution');
const pendingSheetRegistrations = new WeakMap<HeadlessEditor, () => void>();

function createFormulaEditor(options: HeadlessEditorOptions): HeadlessEditor {
  return createHeadlessEditor({
    ...options,
    onCreated: (editor) => {
      options.onCreated?.(editor);
      editor.commands.register(RegisterSheetFormulaContributionCommand, () =>
        new LocalActionCommand(RegisterSheetFormulaContributionCommand.id, () => pendingSheetRegistrations.get(editor)?.()));
    },
  });
}

function registerSheetFormulaContribution(editor: HeadlessEditor, register: () => void): void {
  pendingSheetRegistrations.set(editor, register);
  try {
    editor.commands.run(RegisterSheetFormulaContributionCommand, undefined);
  } finally {
    pendingSheetRegistrations.delete(editor);
  }
}

function registerWorkbookFormulaContribution(editor: HeadlessWorkbookEditor, register: () => void): void {
  pendingWorkbookRegistrations.set(editor, register);
  try {
    editor.commands.run(RegisterWorkbookFormulaContributionCommand, undefined);
  } finally {
    pendingWorkbookRegistrations.delete(editor);
  }
}

const RegisterWorkbookFormulaContributionCommand = defineWorkbookCommand<void, void>('test.workbookFormula.registerContribution');
const pendingWorkbookRegistrations = new WeakMap<HeadlessWorkbookEditor, () => void>();

function createFormulaWorkbookEditor(options: HeadlessWorkbookEditorOptions): HeadlessWorkbookEditor {
  return createHeadlessEditor({
    ...options,
    onCreated: (editor) => {
      options.onCreated?.(editor);
      editor.commands.register(RegisterWorkbookFormulaContributionCommand, () =>
        pendingWorkbookRegistrations.get(editor)?.());
    },
  });
}

describe('third-party formula function plugins', () => {
  it('executes real FILTERXML spill results and reports blocked spill ranges', async () => {
    const state = createFormulaSheetState('=FILTERXML("<r><v>A</v><v>B</v></r>","//v")', [4, 2]);
    const editor = createFormulaEditor({ sheetState: state });
    try {
      registerSheetFormulaContribution(editor, () =>
        editor.services.require(SheetRuntimeCapability.Formula).functions.register(FILTERXML));
      await waitForFormulaIdle(editor.commands);
      expect(formulaResult(editor).status.result).toEqual([['A'], ['B']]);
      const provider = editor.services.require(SheetRuntimeCapability.Formula).results;
      expect(provider.getFormulaResult(1, 0)).toBe('B');
    } finally {
      editor.destroy();
    }
    state.sheetData.addItem(1, 0, { type: CellType.String, value: 'occupied' });
    const blocked = createFormulaEditor({ sheetState: state });
    try {
      registerSheetFormulaContribution(blocked, () =>
        blocked.services.require(SheetRuntimeCapability.Formula).functions.register(FILTERXML));
      await waitForFormulaIdle(blocked.commands);
      expect(formulaResult(blocked).status.errorCode).toBe(FormulaErrorCode.Value);
    } finally {
      blocked.destroy();
    }
  });

  it('recalculates WEBSERVICE and host-enabled FILTERXML after cache completion', async () => {
    const cache = new FormulaWebServiceCache(async () => '<r><v>42</v></r>');
    const editor = createFormulaEditor({
      sheetState: createFormulaSheetState('=FILTERXML(WEBSERVICE("https://example.com/data.xml"),"//v")'),
    });
    try {
      const formula = editor.services.require(SheetRuntimeCapability.Formula);
      registerSheetFormulaContribution(editor, () => {
        formula.functions.register(FILTERXML);
        formula.externalServices.register(FormulaWebServiceDefinition, cache);
      });
      await waitForFormulaIdle(editor.commands);
      expect(formulaResult(editor).status.errorCode).toBe(FormulaErrorCode.NotAvailable);
      await cache.load('https://example.com/data.xml');
      await waitForFormulaIdle(editor.commands);
      expect(formulaResult(editor).status.result).toEqual([['42']]);
      cache.clear();
      await waitForFormulaIdle(editor.commands);
      expect(formulaResult(editor).status.errorCode).toBe(FormulaErrorCode.NotAvailable);
    } finally {
      editor.destroy();
      cache.destroy();
    }
  });

  it('shares Web cache and XML execution across Workbook sheet switches and cross-sheet formulas', async () => {
    const first = createFormulaSheetState('=FILTERXML(WEBSERVICE(Source!B1),"//v")', [4, 2]);
    const source = createFormulaSheetState('=ENCODEURL("A&B")', [4, 2]);
    source.sheetData.addItem(0, 1, { type: CellType.String, value: 'https://example.com/data.xml' });
    const editor = createFormulaWorkbookEditor({
      plugins: [WorkbookFormulaPlugin],
      documentState: createWorkbookDocumentState({
        id: 'web-formulas',
        sheets: [
          { id: 'first', name: 'First' },
          { id: 'source', name: 'Source' },
        ],
        sheetStates: { first, source },
      }),
    });
    const cache = new FormulaWebServiceCache(async () => '<r><v>42</v></r>');
    try {
      const formula = editor.services.require(WorkbookRuntimeCapability.Formula);
      registerWorkbookFormulaContribution(editor, () => {
        formula.functions.register(FILTERXML);
        formula.externalServices.register(FormulaWebServiceDefinition, cache);
      });
      await waitForFormulaIdle(editor.sheets.getActiveEditor()!.commands);
      editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'source' });
      await cache.load('https://example.com/data.xml');
      await waitForFormulaIdle(editor.sheets.getActiveEditor()!.commands);
      expect(formulaResult(editor.sheets.getActiveEditor()!).status.result).toBe('A%26B');
      editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'first' });
      await waitForFormulaIdle(editor.sheets.getActiveEditor()!.commands);
      expect(
        editor.sheets
          .getActiveEditor()!
          .services.require(SheetRuntimeCapability.Formula)
          .results.getFormulaResult(0, 0),
      ).toEqual([['42']]);
    } finally {
      editor.destroy();
      cache.destroy();
    }
  });

  it('recalculates a service-backed formula after a host-driven cache load', async () => {
    const cache = new AsyncFormulaServiceCache<string, number>(async () => 42);
    const service = defineFormulaExternalService<typeof cache>('third-party.number', {
      subscribeInvalidation: (value, listener) => value.subscribeInvalidation(listener),
    });
    const fn: FormulaFunction = {
      name: 'SERVICE_VALUE',
      descriptor: {
        version: 1,
        summary: 'Reads a host cache.',
        category: 'Test',
        example: '=SERVICE_VALUE()',
        parameters: [],
        externalServices: [service.id],
      },
      evaluate(_args, context) {
        const result = context.externalServices?.get(service)?.read('value');
        return result?.status === 'ready' ? result.value : createFormulaError(FormulaErrorCode.NotAvailable);
      },
    };
    const editor = createFormulaEditor({ sheetState: createFormulaSheetState('=SERVICE_VALUE()') });
    try {
      const formula = editor.services.require(SheetRuntimeCapability.Formula);
      registerSheetFormulaContribution(editor, () => {
        formula.functions.register(fn);
        formula.externalServices.register(service, cache);
      });
      expect(formula.xmlXPath.evaluate('<root>value</root>', '//root').values).toEqual(['value']);
      await waitForFormulaIdle(editor.commands);
      expect(formulaResult(editor).status.errorCode).toBe(FormulaErrorCode.NotAvailable);
      await cache.load('value');
      await waitForFormulaIdle(editor.commands);
      expect(formulaResult(editor).status.result).toBe(42);
    } finally {
      editor.destroy();
      cache.destroy();
    }
  });

  it('isolates function registrations between editor instances and disposes them on teardown', async () => {
    ScopedFormulaFunctionPlugin.disposeCount = 0;
    ScopedFormulaFunctionPlugin.usedFormulaCapability = false;
    let editorWithPlugin: HeadlessEditor | undefined;
    let editorWithoutPlugin: HeadlessEditor | undefined;

    try {
      editorWithPlugin = createHeadlessEditor({
        sheetState: createFormulaSheetState(),
        plugins: [ScopedFormulaFunctionPlugin],
      });
      await waitForFormulaIdle(editorWithPlugin.commands);
      expect(formulaResult(editorWithPlugin).status.result).toBe(42);
      expect(ScopedFormulaFunctionPlugin.usedFormulaCapability).toBe(true);

      editorWithPlugin.destroy();
      editorWithPlugin = void 0;
      expect(ScopedFormulaFunctionPlugin.disposeCount).toBe(1);

      editorWithoutPlugin = createHeadlessEditor({ sheetState: createFormulaSheetState() });
      await waitForFormulaIdle(editorWithoutPlugin.commands);

      expect(formulaResult(editorWithoutPlugin).status.errorCode).toBe(FormulaErrorCode.Name);
    } finally {
      editorWithoutPlugin?.destroy();
      editorWithPlugin?.destroy();
    }

    expect(ScopedFormulaFunctionPlugin.disposeCount).toBe(1);
  });
});
