/** @jest-environment node */

import { SceneGraph } from '@searsuite/sear-render-node';
import { SheetRenderEngine } from '@searsuite/sear-render-engine';
import { PasteRangeCommand } from '@searsuite/sear-plugin-clipboard';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';
import { SetRangeCellFillCommand } from '@searsuite/sear-plugin-cell-fill';
import { SheetCommitObservation, ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { serializeSheetDocumentState, deserializeSheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { createHeadlessEditor } from '../src';
import { defineSheetRuntimeCapability } from '@searsuite/sear-assembly-commands';
import {
  SheetPlugin,
  SheetRuntimeCapability,
  type SheetPluginRuntimeContext,
  type SheetPluginServiceContext,
  type SheetPluginSetupContext,
} from '@searsuite/sear-assembly-commands';

import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { PluginKey } from '@searsuite/sear-assembly-plugin';

import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';

const lifecyclePluginKey = new PluginKey('HeadlessLifecyclePlugin');
const lifecyclePhases: string[] = [];
const HeadlessLifecycleCommand = defineSheetCommand('headless.lifecycle');
const HeadlessLifecycleExtension = defineSheetRuntimeCapability<{ readonly name: string }>('headless.lifecycle');
const setupRuntimeHasCommands: 'commands' extends keyof SheetPluginSetupContext['runtime'] ? true : false = false;

@Injectable()
class HeadlessLifecyclePlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('HeadlessLifecyclePlugin');

  public static registerServices({ container }: SheetPluginServiceContext): void {
    void container;
    lifecyclePhases.push('services');
  }

  public constructor() {
    super({ key: lifecyclePluginKey, state: null });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(): null {
    return null;
  }

  public configure(context: SheetPluginSetupContext): void {
    expect(setupRuntimeHasCommands).toBe(false);
    expect('commands' in context.runtime).toBe(false);
    expect(context.runtime.platform).toBeDefined();
    expect(context.runtime.extensions.require(SheetRuntimeCapability.Platform)).toBe(context.runtime.platform);
    expect(context.runtime.extensions.has(SheetRuntimeCapability.Commands)).toBe(false);
    expect(context.runtime.config).toBeDefined();
    expect(context.runtime.data).toBeDefined();
    expect(context.runtime.plugins).toBeDefined();
    expect(context.runtime.cells.catalog).toBeDefined();
    expect(context.runtime.formula.functions).toBeDefined();
    expect(context.runtime.interaction.reducers).toBeDefined();
    context.runtime.extensions.register(HeadlessLifecycleExtension, { name: 'headless-extension' });
    expect(context.runtime.extensions.get(HeadlessLifecycleExtension)?.name).toBe('headless-extension');
    for (const field of ['textShaper', 'render', 'events', 'input', 'scroll', 'lifecycle', 'embeddedEditor', 'toolbar'])
      expect(field in context.runtime).toBe(false);
    expect('core' in context).toBe(false);
    lifecyclePhases.push('strategies');
  }

  public registerObservations(_observations: ObservationRegistry): void {
    lifecyclePhases.push('observations');
  }

  public registerCommands(commands: SheetCommandBus): void {
    commands.register(
      HeadlessLifecycleCommand,
      () => new LocalActionCommand(HeadlessLifecycleCommand.id, () => lifecyclePhases.push('command-run')),
    );
    lifecyclePhases.push('commands');
  }

  public initialize(context: SheetPluginRuntimeContext): void {
    expect('core' in context).toBe(false);
    expect(context.runtime.commands).toBeDefined();
    expect(context.runtime.extensions.require(SheetRuntimeCapability.Commands)).toBe(context.runtime.commands);
    expect(context.runtime.extensions.require(HeadlessLifecycleExtension).name).toBe('headless-extension');
    lifecyclePhases.push('initialize');
  }

  public start(context: SheetPluginRuntimeContext): void {
    expect(context.runtime.extensions.require(HeadlessLifecycleExtension).name).toBe('headless-extension');
    lifecyclePhases.push('start');
  }

  public onEditorDestroy(context: SheetPluginRuntimeContext): void {
    lifecyclePhases.push('destroy');
  }
}

function createSheetState() {
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 2]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]);
  rowSizes.setDefaultValue(24);
  columnSizes.setDefaultValue(100);
  return {
    sheetData: new SheetMatrix({ data: [], indices: [0, 0, 0], indptr: [] }, [2, 2]),
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, [2, 2]),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, [2, 2]),
    cellFills: new CellFillMatrix(void 0, [2, 2]),
    cellHighlights: new CellHighlightMatrix(void 0, [2, 2]),
    duplicates: new DuplicateMatrix(void 0, [2, 2]),
    cellFormats: new CellFormatMatrix(void 0, [2, 2]),
    cellMerges: new CellMergeMatrix(void 0, [2, 2]),
  };
}

describe('createHeadlessEditor', () => {
  it('uses an editor-local wall clock for volatile formulas', () => {
    const timestamp = Date.parse('2026-10-11T15:13:23.934Z');
    const editor = createHeadlessEditor({ sheetState: createSheetState(), currentDateTime: () => timestamp });
    expect(editor.services.require(SheetRuntimeCapability.Platform).currentDateTime()).toBe(timestamp);
    editor.destroy();
  });

  it('keeps Google-specific functions available through explicit editor-local registration', () => {
    const editor = createHeadlessEditor({ sheetState: createSheetState() });
    const functions = editor.services.require(SheetRuntimeCapability.Formula).functions;
    expect(functions.has('SUM')).toBe(true);
    expect(functions.has('ADD')).toBe(false);
    expect(functions.has('ARRAY_CONSTRAIN')).toBe(false);
    expect(functions.has('REGEXTEST')).toBe(false);
    expect(functions.has('FILTERXML')).toBe(false);
    editor.destroy();
  });

  it('assembles the same editor runtime without browser APIs', () => {
    const editor = createHeadlessEditor({ sheetState: createSheetState() });

    expect(editor.commands).toBeDefined();

    editor.destroy();
  });

  it('runs plugin runtime hooks in their documented lifecycle order', () => {
    lifecyclePhases.length = 0;
    const editor = createHeadlessEditor({
      sheetState: createSheetState(),
      plugins: [HeadlessLifecyclePlugin],
    });

    expect(lifecyclePhases.slice(0, 4)).toEqual(['services', 'commands', 'observations', 'strategies']);
    expect(editor.commands.getRegisteredCommandIds()).toContain('headless.lifecycle');
    editor.commands.run(HeadlessLifecycleCommand, void 0);
    expect(lifecyclePhases).toContain('command-run');
    expect(lifecyclePhases).not.toContain('render');
    expect(lifecyclePhases.indexOf('start')).toBeGreaterThan(lifecyclePhases.indexOf('initialize'));

    editor.destroy();
    expect(lifecyclePhases.at(-1)).toBe('destroy');
  });
});

it('commits, observes, undoes and restores state without generating scene nodes or painting', () => {
  const scene = jest.spyOn(SceneGraph.prototype, 'addPluginNode');
  const paint = jest.spyOn(SheetRenderEngine.prototype, 'render');
  const editor = createHeadlessEditor({ sheetState: createSheetState() });
  const revisions: number[] = [];
  const dispose = editor.observations.subscribe(SheetCommitObservation, (event) => {
    revisions.push(event.revision);
    // A read-only command must not recursively publish another commit.
    editor.commands.run(ExportSheetStateCommand, undefined);
  });
  let restored: import('@searsuite/sear-assembly-commands').SheetEditor | undefined;
  try {
    editor.commands.run(PasteRangeCommand, { payload: { plainText: '42' }, target: [0, 0] });
    editor.commands.run(SetRangeCellFillCommand, { anchor: [0, 0], focus: [0, 0], fill: '#ff0000' });
    const read = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(read().sheetData.getItem(0, 0)?.value).toBe(42);
    expect(read().cellFills.getItem(0, 0)).toBe('#ff0000');
    editor.commands.run(UndoSheetCommand, undefined);
    expect(read().cellFills.getItem(0, 0)).toBeNull();
    editor.commands.run(RedoSheetCommand, undefined);
    expect(read().cellFills.getItem(0, 0)).toBe('#ff0000');
    const saved = JSON.parse(JSON.stringify(serializeSheetDocumentState(read())));
    restored = createHeadlessEditor({ sheetState: deserializeSheetDocumentState(saved) });
    const state = restored.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(state.sheetData.getItem(0, 0)?.value).toBe(42);
    expect(state.cellFills.getItem(0, 0)).toBe('#ff0000');
    expect(revisions.length).toBeGreaterThan(1);
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(scene).not.toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
  } finally {
    dispose();
    editor.destroy();
    restored?.destroy();
    scene.mockRestore();
    paint.mockRestore();
  }
});
