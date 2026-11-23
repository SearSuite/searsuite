import 'reflect-metadata';
import { Container, Injectable } from '@searsuite/sear-foundation-di';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { Platform } from '@searsuite/sear-foundation-platform';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import {
  HeadlessRenderContext,
  HeadlessOffScreenRenderContext,
  HeadlessHitRenderContext,
} from '@searsuite/sear-render-context';
import { HeadlessScroller } from '@searsuite/sear-render-scroll';
import { HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import {
  HeadlessKeyboardRouter,
  HeadlessTextInput,
  HeadlessPointerCapture,
  type KeyboardRouterHandlers,
} from '@searsuite/sear-render-input';
import { HeadlessCursorEngine } from '@searsuite/sear-render-cursor';
import { HeadlessCollabTransport } from '@searsuite/sear-plugin-collab';
import { HeadlessToolbar } from '@searsuite/sear-assembly-plugin';
import {
  FillSheetRangeCommand,
  HandleSheetRangeDragCommand,
  HandleSheetSelectionPointerCommand,
  RestartSheetSelectionNavigationCommand,
  SheetRangeDragAction,
  SelectRangeCommand,
  GetSelection,
  GetSelections,
  GetSelectionNavigation,
  GetActiveCell,
  SheetSelectionPlugin,
} from '@searsuite/sear-plugin-selection';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-render-engine';
import { readSheetCellFormats } from '@searsuite/sear-plugin-cell-format';
import { SheetHorizontalAlignment } from '@searsuite/sear-domain-cell-types';
import { DataValidationInputPolicy, DataValidationKind } from '@searsuite/sear-plugin-data-validation';
import { CreateSheetFilterCommand, SetSheetColumnFilterCommand, SheetFilterKind } from '@searsuite/sear-plugin-filter';
import { SheetSortDirection, SortSheetRangeCommand } from '@searsuite/sear-plugin-sort';
import { CellRegion } from '@searsuite/sear-render-registry';
import {
  HandleDocumentInputCommand,
  IsCellEditingQuery,
  SheetCellEditorPlugin,
  SheetFormulaBarObservation,
} from '@searsuite/sear-plugin-cell-editor';
import { ToggleMergeCellsCommand } from '@searsuite/sear-plugin-cell-merge';
import { SetSheetFreezeCommand } from '@searsuite/sear-plugin-freeze';
import { SetSheetRowsFixedCommand } from '@searsuite/sear-plugin-fixed-row';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';
import { RedoSheetCommand, UndoSheetCommand } from '@searsuite/sear-plugin-history';
import {
  createSheetEditor,
  createEmptySheetDocumentState,
  ExportSheetStateCommand,
  ResizeSheetViewportCommand,
  ScrollViewportToCommand,
} from '../src';

@Injectable()
class TestKeyboardRouter extends HeadlessKeyboardRouter {
  public static current: TestKeyboardRouter | null = null;
  public handlers: KeyboardRouterHandlers = {};

  public constructor() {
    super();
    TestKeyboardRouter.current = this;
  }

  public override subscribe(handlers: KeyboardRouterHandlers): void {
    Object.assign(this.handlers, handlers);
  }
}

function createEditor(
  rows = 3,
  columns = 3,
  populate?: (state: ReturnType<typeof createEmptySheetDocumentState>) => void,
) {
  let container: Container | null = null;
  const sheetState = createEmptySheetDocumentState(rows, columns);
  sheetState.sheetData.addItem(1, 1, { type: 'string', value: 'keep' });
  populate?.(sheetState);
  const editor = createSheetEditor({
    sheetState,
    adapters: {
      registerEnvironment(value) {
        container = value;
      },
      platform: HeadlessPlatform,
      createRenderContexts: () => ({
        renderContext: new HeadlessRenderContext(),
        offScreenRenderContext: new HeadlessOffScreenRenderContext(),
        hitRenderContext: new HeadlessHitRenderContext(),
      }),
      scroller: HeadlessScroller,
      eventRegistrar: HeadlessEventRegistrar,
      textInput: HeadlessTextInput,
      keyboardRouter: TestKeyboardRouter,
      pointerCapture: HeadlessPointerCapture,
      cursorEngine: HeadlessCursorEngine,
      collabTransport: HeadlessCollabTransport,
      toolbar: HeadlessToolbar,
    },
  });
  const localContainer = container as Container | null;
  if (!localContainer) throw new Error('Missing test editor container');
  return {
    editor,
    keyboard: TestKeyboardRouter.current!,
    core: localContainer.resolve<SearCoreSheet>(SearCoreSheet.symbol),
    selection: localContainer.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol),
    cellEditor: localContainer.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol),
    platform: localContainer.resolve<HeadlessPlatform>(Platform.symbol),
  };
}

describe('Sheet selection keyboard regression', () => {
  it('BUG-1161 INT15-008 moves the active cell after sorting a filtered row out of view', () => {
    const { editor, core } = createEditor(6, 3, (state) => {
      for (const [row, name, rank] of [
        [0, 'Name', 'Rank'], [1, 'keep', '3'], [2, 'hide', '1'], [3, 'keep', '2'],
      ] as const) {
        state.sheetData.addItem(row, 0, { type: 'string', value: name });
        state.sheetData.addItem(row, 1, { type: 'string', value: rank });
      }
    });
    try {
      editor.commands.run(CreateSheetFilterCommand, { range: { start: [0, 0], end: [3, 1] } });
      editor.commands.run(SetSheetColumnFilterCommand, {
        column: 0, predicate: { kind: SheetFilterKind.Values, values: ['keep'] },
      });
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      editor.commands.run(SortSheetRangeCommand, {
        range: { start: [0, 0], end: [3, 1] },
        keys: [{ column: 1, direction: SheetSortDirection.Ascending }],
        firstRowIsHeader: true,
      });
      expect(readSheetRowSizes(core.getDataEngine())?.getItem(0, 1)).toBe(0);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([2, 1]);
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('2');
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe('1');
    } finally {
      editor.destroy();
    }
  });

  it('BUG-039 skips filtered rows for arrows, extended selection, and Enter after editing', () => {
    const { editor, keyboard, core } = createEditor(20, 4, (state) => {
      for (const [row, name] of [[12, 'Name'], [13, 'Alice'], [14, 'Bob'], [15, 'Cara']] as const) {
        state.sheetData.addItem(row, 1, { type: 'string', value: name });
      }
    });
    try {
      editor.commands.run(CreateSheetFilterCommand, { range: { start: [12, 1], end: [15, 1] } });
      editor.commands.run(SetSheetColumnFilterCommand, {
        column: 1, predicate: { kind: SheetFilterKind.Values, values: ['Alice'] },
      });
      expect(readSheetRowSizes(core.getDataEngine())?.getItem(0, 14)).toBe(0);
      editor.commands.run(SelectRangeCommand, { anchor: [13, 1], focus: [13, 1] });
      keyboard.handlers.onArrowDown?.(false, false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([16, 1]);
      keyboard.handlers.onArrowUp?.(false, false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([13, 1]);
      keyboard.handlers.onArrowDown?.(true, false);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [13, 1], end: [16, 1] });
      editor.commands.run(SelectRangeCommand, { anchor: [13, 1], focus: [13, 1] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'Zoe' });
      keyboard.handlers.onEnter?.(false, false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([16, 1]);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(14, 1)?.value).toBe('Bob');
    } finally {
      editor.destroy();
    }
  });

  it('BUG-910 inserts static date and time values with one undo each', () => {
    const { editor, keyboard, core, platform } = createEditor();
    const fixed = new Date(2026, 10, 8, 14, 23, 45).getTime();
    jest.spyOn(platform, 'currentDateTime').mockReturnValue(fixed);
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      expect(keyboard.handlers.onInsertCurrentDate?.()).toBe(true);
      const date = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 0);
      expect(date?.type).toBe('number');
      expect(date?.value).toBe((Date.UTC(2026, 10, 8) - Date.UTC(1899, 11, 31)) / 86_400_000 + 1);
      expect(readSheetCellFormats(core.getDataEngine())?.getItem(0, 0)?.kind).toBe('date');
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 0)).toBeNull();
      expect(readSheetCellFormats(core.getDataEngine())?.getItem(0, 0)).toBeNull();

      editor.commands.run(SelectRangeCommand, { anchor: [0, 2], focus: [0, 2] });
      expect(keyboard.handlers.onInsertCurrentTime?.()).toBe(true);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 2)?.value).toBe(
        (14 * 3600 + 23 * 60 + 45) / 86_400,
      );
      expect(readSheetCellFormats(core.getDataEngine())?.getItem(0, 2)?.kind).toBe('time');
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 2)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('BUG-481 paints the live edit at the visible fixed row before commit', () => {
    const { editor, core, cellEditor, keyboard } = createEditor(200, 10);
    try {
      editor.commands.run(SetSheetRowsFixedCommand, { index: 9, fixed: true });
      editor.commands.run(SelectRangeCommand, { anchor: [9, 1], focus: [9, 1] });
      editor.commands.run(ScrollViewportToCommand, { x: 0, y: 3000 });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'FIXED' });
      const editNodes = cellEditor.render(core).filter((node) => node.properties.isEdit);
      expect(editNodes.length).toBeGreaterThan(0);
      expect(editNodes.every((node) => node.sticky && node.top === 24 && node.y === 24)).toBe(true);
      keyboard.handlers.onEnter?.(false, false);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(9, 1)?.value).toBe(
        'FIXED',
      );
    } finally {
      editor.destroy();
    }
  });

  it('BUG-480 reveals the next row below a fixed row after navigating from it', () => {
    const { editor, core, keyboard } = createEditor(200, 10);
    try {
      editor.commands.run(SetSheetRowsFixedCommand, { index: 9, fixed: true });
      editor.commands.run(SelectRangeCommand, { anchor: [9, 1], focus: [9, 1] });
      editor.commands.run(ScrollViewportToCommand, { x: 0, y: 3000 });
      keyboard.handlers.onArrowDown?.(false, false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([10, 1]);
      const rows = readSheetRowSizes(core.getDataEngine())!;
      const nextRowTop = rows.getDimensionLeftBoundaryByIndex(10);
      const fixedRowHeight = rows.getItem(0, 9)!;
      expect(core.renderEngine.scrollManager.getState().y).toBe(nextRowTop - fixedRowHeight);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-450 reveals the next merged cell below the frozen rows after editing', () => {
    const { editor, core, keyboard } = createEditor(100, 10);
    try {
      editor.commands.run(ToggleMergeCellsCommand, { anchor: [3, 1], focus: [4, 3] });
      editor.commands.run(SetSheetFreezeCommand, { rows: 3, columns: 2 });
      editor.commands.run(SelectRangeCommand, { anchor: [2, 1], focus: [2, 1] });
      editor.commands.run(ScrollViewportToCommand, { x: 0, y: 500 });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'freeze-check' });
      keyboard.handlers.onEnter?.(false, false);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(2, 1)?.value).toBe(
        'freeze-check',
      );
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [3, 1], end: [4, 3] });
      expect(core.renderEngine.scrollManager.getState().y).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-894 fills down and right from the selected edge in one undoable command', () => {
    const { editor, keyboard } = createEditor(4, 4, (state) => {
      state.sheetData.addItem(0, 1, { type: 'string', value: 'hello' });
      state.sheetData.addItem(2, 1, { type: 'string', value: 'world' });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [1, 1] });
      keyboard.handlers.onFillDown?.();
      let data = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(data.getItem(1, 1)?.value).toBe('hello');
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 1], end: [1, 1] });
      editor.commands.run(UndoSheetCommand, undefined);
      data = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(data.getItem(1, 1)?.value).toBe('keep');

      editor.commands.run(SelectRangeCommand, { anchor: [2, 1], focus: [2, 2] });
      keyboard.handlers.onFillRight?.();
      data = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(data.getItem(2, 2)?.value).toBe('world');
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(2, 2)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('BUG-930 rebases relative formulas while filling and keeps absolute references fixed', () => {
    const { editor } = createEditor(8, 3, (state) => {
      state.sheetData.addItem(0, 0, { type: 'number', value: 1 });
      state.sheetData.addItem(1, 0, { type: 'number', value: 2 });
      state.sheetData.addItem(2, 0, { type: 'number', value: 3 });
      state.sheetData.addItem(0, 1, { type: 'formula', formula: '=A1' });
      state.sheetData.addItem(4, 1, { type: 'formula', formula: '=$A$1' });
    });
    try {
      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [0, 1], end: [0, 1] }, target: [2, 1],
      });
      let cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(cells.getItem(1, 1)?.formula).toBe('=A2');
      expect(cells.getItem(2, 1)?.formula).toBe('=A3');
      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [4, 1], end: [4, 1] }, target: [5, 1],
      });
      cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(cells.getItem(5, 1)?.formula).toBe('=$A$1');
      editor.commands.run(UndoSheetCommand, undefined);
      cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(cells.getItem(5, 1)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('BUG-911 copies the formula above exactly and supports undo', () => {
    const { editor, keyboard } = createEditor(4, 3, (state) => {
      state.sheetData.addItem(0, 1, { type: 'formula', formula: '=A1' });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onCopyFormulaAbove?.();
      let cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(cells.getItem(1, 1)?.formula).toBe('=A1');
      editor.commands.run(UndoSheetCommand, undefined);
      cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(cells.getItem(1, 1)).toEqual({ type: 'string', value: 'keep' });
    } finally {
      editor.destroy();
    }
  });

  it('routes pointer selection session transitions through the command bus', () => {
    const { editor, core, selection } = createEditor();
    const phases: string[] = [];
    const rangeCommands: string[] = [];
    const navigationCommands: string[] = [];
    editor.commands.subscribe((event) => {
      if (event.id === HandleSheetSelectionPointerCommand.id) phases.push(event.phase);
      if (event.id === SelectRangeCommand.id && event.phase === 'completed') rangeCommands.push(event.id);
      if (event.id === RestartSheetSelectionNavigationCommand.id && event.phase === 'completed')
        navigationCommands.push(event.id);
    });
    const pointer = (row: number, column: number) =>
      ({
        origin: { offsetX: 100, offsetY: 90 },
        target: {
          properties: {
            region: CellRegion.Grid,
            startRowIndex: row,
            endRowIndex: row,
            startColIndex: column,
            endColIndex: column,
          },
        },
      } as never);
    try {
      selection.onMouseDown(core, pointer(0, 0));
      const retainedNavigation = editor.queries.run(GetSelectionNavigation, undefined);
      retainedNavigation.origin![0] = 99;
      Object.assign(selection, {
        isSelecting: false,
        headerDragMode: 'row',
        selectionPointer: { x: -100, y: -100 },
        selectionOrigin: [99, 99],
        selectionCursor: [99, 99],
      });
      expect(editor.queries.run(GetSelectionNavigation, undefined)).toEqual({
        origin: [0, 0],
        cursor: [0, 0],
      });
      expect(() => selection.render({} as never, { x: 0, y: 0 })).toThrow('cannot be replaced');
      selection.onMouseMove(core, pointer(1, 1));
      selection.onMouseUp(core, pointer(1, 1));
      selection.restartNavigation();
      expect(rangeCommands).toHaveLength(1);
      expect(navigationCommands).toEqual([RestartSheetSelectionNavigationCommand.id]);
      expect(() => selection.registerQueries(new SheetQueryRegistry())).toThrow('editor.commands.run');
      expect(phases).toEqual(['started', 'completed', 'started', 'completed', 'started', 'completed']);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [1, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-001 clears the selected value and restores it with one undo', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onDelete?.();
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)).toBeNull();
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
        'keep',
      );
    } finally {
      editor.destroy();
    }
  });

  it('BUG-002 selects the entire sheet from a focused cell', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onSelectAll?.();
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [2, 2] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-936 keeps the selected range when right-clicking inside it', () => {
    const { editor, core, selection } = createEditor(5, 4);
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [2, 1] });
      const cell = {
        origin: { button: 2, offsetX: 100, offsetY: 90 },
        target: {
          properties: {
            region: CellRegion.Grid,
            startRowIndex: 1,
            endRowIndex: 1,
            startColIndex: 1,
            endColIndex: 1,
          },
        },
      } as never;
      selection.onMouseDown(core, cell);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [1, 1], end: [2, 1] });
      editor.commands.run(SelectRangeCommand, { anchor: [1, 0], focus: [2, 3] });
      const header = {
        origin: { button: 2, offsetX: 10, offsetY: 90 },
        target: {
          properties: {
            region: CellRegion.RowHeader,
            startRowIndex: 1,
            endRowIndex: 1,
          },
        },
      } as never;
      selection.onMouseDown(core, header);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [1, 0], end: [2, 3] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-003 enters existing content with F2 and appends new text', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onEdit?.();
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'x' });
      keyboard.handlers.onEnter?.(false);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
        'keepx',
      );
    } finally {
      editor.destroy();
    }
  });

  it('BUG-977 inserts before a joined emoji after two left arrows and commits intact text', () => {
    const { editor, keyboard } = createEditor(4, 4, (state) => {
      state.sheetData.addItem(0, 1, { type: 'string', value: 'a👩‍💻b' });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [0, 1] });
      keyboard.handlers.onEdit?.();
      keyboard.handlers.onArrowLeft?.(false, false);
      keyboard.handlers.onArrowLeft?.(false, false);
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'X' });
      keyboard.handlers.onEnter?.(false);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 1)?.value).toBe(
        'aX👩‍💻b',
      );
    } finally {
      editor.destroy();
    }
  });

  it('BUG-006 commits with Shift+Enter and moves upward', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onEdit?.();
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'x' });
      keyboard.handlers.onEnter?.(true);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
        'keepx',
      );
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 1], end: [0, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-007 cycles Tab through a multi-cell selection', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] });
      const positions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [0, 0],
      ];
      for (const position of positions) {
        keyboard.handlers.onTab?.(false);
        expect(editor.queries.run(GetActiveCell, undefined)).toEqual(position);
        expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [1, 1] });
      }
      keyboard.handlers.onTab?.(true);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([1, 1]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-953 skips merged cells on Tab and Shift+Tab', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(ToggleMergeCellsCommand, { anchor: [0, 0], focus: [0, 1] });
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [0, 1] });
      keyboard.handlers.onTab?.(false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([0, 2]);
      keyboard.handlers.onTab?.(true);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [0, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-008 fills the entire selection with Ctrl+Enter in one commit', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'same' });
      keyboard.handlers.onEnter?.(false, true);
      const data = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      for (let row = 0; row <= 1; row += 1) {
        for (let col = 0; col <= 1; col += 1) expect(data.getItem(row, col)?.value).toBe('same');
      }
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [1, 1] });
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
        'keep',
      );
    } finally {
      editor.destroy();
    }
  });

  it('BUG-1154 omits hidden merged cells from a batch commit', () => {
    const { editor, keyboard } = createEditor(4, 4);
    try {
      editor.commands.run(ToggleMergeCellsCommand, { anchor: [2, 0], focus: [2, 1] });
      editor.commands.run(SelectRangeCommand, { anchor: [1, 0], focus: [2, 1] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'REPEAT' });
      keyboard.handlers.onEnter?.(false, true);
      const data = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(data.getItem(1, 0)?.value).toBe('REPEAT');
      expect(data.getItem(1, 1)?.value).toBe('REPEAT');
      expect(data.getItem(2, 0)?.value).toBe('REPEAT');
      expect(data.getItem(2, 1)).toBeNull();
      editor.commands.run(UndoSheetCommand, undefined);
      const restored = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(restored.getItem(1, 0)).toBeNull();
      expect(restored.getItem(1, 1)?.value).toBe('keep');
      expect(restored.getItem(2, 0)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('BUG-965 fills each disjoint selected cell with Ctrl+Enter and leaves the gap untouched', () => {
    const { editor, core, selection, keyboard } = createEditor(4, 5);
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      selection.onMouseDown(core, {
        target: {
          properties: {
            region: CellRegion.Grid,
            startRowIndex: 1,
            endRowIndex: 1,
            startColIndex: 3,
            endColIndex: 3,
          },
        },
        origin: { metaKey: true },
      } as never);
      selection.onMouseUp(core, {} as never);
      expect(editor.queries.run(GetSelections, undefined)).toHaveLength(2);
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'multi' });
      keyboard.handlers.onEnter?.(false, true);
      const values = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(values.getItem(1, 1)?.value).toBe('multi');
      expect(values.getItem(1, 2)).toBeNull();
      expect(values.getItem(1, 3)?.value).toBe('multi');
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
        'keep',
      );
    } finally {
      editor.destroy();
    }
  });

  it('BUG-009 and BUG-090 move Home to the row or sheet start', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [2, 2], focus: [2, 2] });
      keyboard.handlers.onHome?.(false, false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([2, 0]);
      keyboard.handlers.onHome?.(true, false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([0, 0]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-010 stops at the end of a continuous column of data', () => {
    const { editor, keyboard } = createEditor(8, 4, (state) => {
      state.sheetData.addItem(2, 1, { type: 'number', value: 2 });
      state.sheetData.addItem(3, 1, { type: 'number', value: 3 });
      state.sheetData.addItem(6, 1, { type: 'number', value: 6 });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onArrowDown?.(false, true);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([3, 1]);
      editor.commands.run(SelectRangeCommand, { anchor: [5, 1], focus: [5, 1] });
      keyboard.handlers.onArrowDown?.(false, true);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([6, 1]);
      editor.commands.run(SelectRangeCommand, { anchor: [3, 1], focus: [3, 1] });
      keyboard.handlers.onArrowUp?.(false, true);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([1, 1]);
      editor.commands.run(SelectRangeCommand, { anchor: [6, 1], focus: [6, 1] });
      keyboard.handlers.onArrowDown?.(false, true);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([7, 1]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-090 Ctrl+End finds the last occupied row and column', () => {
    const { editor, keyboard } = createEditor(12, 7, (state) => {
      state.sheetData.addItem(8, 2, { type: 'number', value: 8 });
      state.sheetData.addItem(4, 5, { type: 'number', value: 5 });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      keyboard.handlers.onEnd?.(false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([8, 5]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-091 pages the selection through the visible rows', () => {
    const { editor, keyboard, core } = createEditor(80, 3);
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 180, height: 120 });
      editor.commands.run(SelectRangeCommand, { anchor: [20, 1], focus: [20, 1] });
      keyboard.handlers.onPage?.(1, false);
      const afterDown = editor.queries.run(GetActiveCell, undefined)![0];
      expect(afterDown).toBeGreaterThan(20);
      keyboard.handlers.onPage?.(-1, false);
      expect(editor.queries.run(GetActiveCell, undefined)?.[0]).toBeLessThan(afterDown);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-968 extends from the original cell to the used end and back to A1', () => {
    const { editor, keyboard } = createEditor(12, 7, (state) => {
      state.sheetData.addItem(8, 2, { type: 'number', value: 8 });
      state.sheetData.addItem(4, 5, { type: 'number', value: 5 });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [2, 1], focus: [2, 1] });
      keyboard.handlers.onEnd?.(true);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [2, 1], end: [8, 5] });
      expect(editor.queries.run(GetSelectionNavigation, undefined)).toEqual({ origin: [2, 1], cursor: [8, 5] });
      editor.commands.run(SelectRangeCommand, { anchor: [8, 5], focus: [8, 5] });
      keyboard.handlers.onHome?.(true, true);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [8, 5] });
      expect(editor.queries.run(GetSelectionNavigation, undefined)).toEqual({ origin: [8, 5], cursor: [0, 0] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-975 keeps the original anchor through Shift+PageDown/PageUp and Shift+Home', () => {
    const { editor, keyboard } = createEditor(80, 4);
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 180, height: 120 });
      editor.commands.run(SelectRangeCommand, { anchor: [20, 1], focus: [20, 1] });
      keyboard.handlers.onPage?.(1, true);
      const afterDown = editor.queries.run(GetSelection, undefined)!;
      expect(afterDown.start).toEqual([20, 1]);
      expect(afterDown.end[0]).toBeGreaterThan(20);
      keyboard.handlers.onPage?.(-1, true);
      expect(editor.queries.run(GetSelectionNavigation, undefined).origin).toEqual([20, 1]);
      expect(editor.queries.run(GetSelectionNavigation, undefined).cursor![0]).toBeLessThan(afterDown.end[0]);
      editor.commands.run(SelectRangeCommand, { anchor: [20, 1], focus: [20, 1] });
      keyboard.handlers.onHome?.(false, true);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [20, 0], end: [20, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-248 scrolls and extends a selection while held at the viewport edge', () => {
    const { editor, core, selection, platform } = createEditor(80, 3);
    let frame: ((time: number) => void) | null = null;
    const schedule = jest.spyOn(platform, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 180, height: 120 });
      const target = {
        properties: { region: CellRegion.Grid, startRowIndex: 2, endRowIndex: 2, startColIndex: 1, endColIndex: 1 },
      };
      selection.onMouseDown(core, { target, origin: { offsetX: 100, offsetY: 90 } } as never);
      selection.onMouseMove(core, { target, origin: { offsetX: 100, offsetY: 118 } } as never);
      expect(frame).not.toBeNull();
      (frame as unknown as (time: number) => void)(0);
      expect(core.renderEngine.scrollManager.getState().y).toBeGreaterThan(0);
      expect(editor.queries.run(GetSelection, undefined)?.end[0]).toBeGreaterThan(2);
      selection.onMouseUp(core, {} as never);
    } finally {
      schedule.mockRestore();
      editor.destroy();
    }
  });

  it.each([
    ['BUG-092', '1,234', 1234, 'number'],
    ['BUG-093', '50%', 0.5, 'percent'],
    ['BUG-094', '2/29/2024', 45351, 'date'],
    ['BUG-094', '2024-02-29', 45351, 'date'],
    ['BUG-094', '12:30', 0.5208333333333334, 'time'],
    ['BUG-095', 'TRUE', true, null],
    ['BUG-096', '$12.34', 12.34, 'currency'],
  ])('%s classifies direct input %s with its display format', (_bug, input, value, formatKind) => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: input });
      keyboard.handlers.onEnter?.(false);
      const state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.sheetData.getItem(0, 0)?.value).toBe(value);
      expect(state.cellFormats.getItem(0, 0)?.kind ?? null).toBe(formatKind);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-095 keeps a directly entered Boolean logical when referenced by a formula', async () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'TRUE' });
      keyboard.handlers.onEnter?.(false);
      editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [0, 1] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '=ISLOGICAL(A1)' });
      keyboard.handlers.onEnter?.(false);
      await waitForFormulaIdle(editor.commands);
      expect(editor.commands.run(GetFormulaCellStatusCommand, { row: 0, col: 1 }).status.result).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-730 extends the sheet before Enter moves past its last row', () => {
    const { editor, keyboard, core } = createEditor();
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 180, height: 72 });
      editor.commands.run(SelectRangeCommand, { anchor: [2, 1], focus: [2, 1] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'EDGE_B' });
      keyboard.handlers.onEnter?.(false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([3, 1]);
      expect(core.renderEngine.scrollManager.getState().y).toBeGreaterThan(0);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(2, 1)?.value).toBe(
        'EDGE_B',
      );
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'EDGE_C' });
      keyboard.handlers.onEnter?.(false);
      const state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.sheetData.getItem(2, 1)?.value).toBe('EDGE_B');
      expect(state.sheetData.getItem(3, 1)?.value).toBe('EDGE_C');
    } finally {
      editor.destroy();
    }
  });

  it('BUG-873 extends the sheet before Tab moves past its last column', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 2], focus: [1, 2] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'EDGE_A' });
      keyboard.handlers.onTab?.(false);
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([1, 3]);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 2)?.value).toBe(
        'EDGE_A',
      );
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'EDGE_B' });
      keyboard.handlers.onTab?.(false);
      const state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.sheetData.getItem(1, 2)?.value).toBe('EDGE_A');
      expect(state.sheetData.getItem(1, 3)?.value).toBe('EDGE_B');
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([1, 4]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-1177 INT14-001 groups a boundary cell commit with its row or column extension', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [2, 0], focus: [2, 0] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'alpha' });
      keyboard.handlers.onEnter?.(false);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.rowSizes.shape[1]).toBe(4);
      editor.commands.run(UndoSheetCommand, undefined);
      let state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.rowSizes.shape[1]).toBe(3);
      expect(state.sheetData.getItem(2, 0)).toBeNull();
      editor.commands.run(RedoSheetCommand, undefined);
      state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.rowSizes.shape[1]).toBe(4);
      expect(state.sheetData.getItem(2, 0)?.value).toBe('alpha');

      editor.commands.run(SelectRangeCommand, { anchor: [1, 2], focus: [1, 2] });
      editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'corner' });
      keyboard.handlers.onTab?.(false);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.columnSizes.shape[1]).toBe(4);
      editor.commands.run(UndoSheetCommand, undefined);
      state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.columnSizes.shape[1]).toBe(3);
      expect(state.sheetData.getItem(1, 2)).toBeNull();
      expect(state.sheetData.getItem(2, 0)?.value).toBe('alpha');
    } finally {
      editor.destroy();
    }
  });

  it('BUG-551 fills below the selected cell without moving the source', () => {
    const { editor } = createEditor(5, 3, (state) => {
      state.sheetData.addItem(0, 1, { type: 'number', value: 12.34 });
    });
    try {
      editor.commands.run(FillSheetRangeCommand, { source: { start: [0, 1], end: [0, 1] }, target: [2, 1] });
      const values = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2].map((row) => values.getItem(row, 1)?.value)).toEqual([12.34, 12.34, 12.34]);
      editor.commands.run(UndoSheetCommand, undefined);
      const undone = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2].map((row) => undone.getItem(row, 1)?.value ?? null)).toEqual([12.34, 'keep', null]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-1178 INT14-004 fills number formats, alignment, and validation rules in one undo step', () => {
    const { editor } = createEditor(5, 3, (state) => {
      state.sheetData.addItem(0, 0, { type: 'number', value: 0.25 });
      state.cellFormats.addItem(0, 0, { kind: 'percent' });
      state.sheetData.addItem(0, 1, { type: 'string', value: 'red' });
      state.dataValidations?.addItem(0, 1, [{
        id: 'source-rule', endRow: 0, endColumn: 1,
        condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'red' }, { label: 'blue' }] },
        inputPolicy: DataValidationInputPolicy.Reject,
      }]);
    });
    try {
      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [0, 0], end: [0, 0] }, target: [2, 0],
      });
      let state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      for (const row of [1, 2]) {
        expect(state.sheetData.getItem(row, 0)?.value).toBe(0.25);
        expect(state.cellFormats.getItem(row, 0)).toEqual({ kind: 'percent' });
        expect(state.cellAlignments.getItem(row, 0)).toBe(SheetHorizontalAlignment.Left);
      }

      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [0, 1], end: [0, 1] }, target: [2, 1],
      });
      state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      for (const row of [1, 2]) {
        expect(state.sheetData.getItem(row, 1)?.value).toBe('red');
        expect(state.dataValidations?.findRules(row, 1)[0]?.rule.condition.kind).toBe(DataValidationKind.Dropdown);
      }
      editor.commands.run(UndoSheetCommand, undefined);
      state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.sheetData.getItem(1, 1)?.value).toBe('keep');
      expect(state.dataValidations?.findRules(1, 1)).toEqual([]);
      editor.commands.run(RedoSheetCommand, undefined);
      state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.sheetData.getItem(1, 1)?.value).toBe('red');
      expect(state.dataValidations?.findRules(1, 1)).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-551 starts a fill gesture from the visible selection handle', () => {
    const { editor, core, selection } = createEditor(5, 3, (state) => {
      state.sheetData.addItem(0, 1, { type: 'number', value: 12.34 });
    });
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 400, height: 400 });
      editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [0, 1] });
      const rows = readSheetRowSizes(core.getDataEngine())!;
      const columns = readSheetColumnSizes(core.getDataEngine())!;
      const config = core.configEngine.getDefaultConfig();
      const x = columns.getDimensionRightBoundaryByIndex(1) + (config.sheetOffsetX ?? 50);
      const y = rows.getDimensionRightBoundaryByIndex(0) + (config.sheetOffsetY ?? 24);
      const target = { properties: { region: CellRegion.Grid } };
      expect(selection.onMouseDown(core, { target, origin: { offsetX: x, offsetY: y } } as never)).toBe(false);
      const destination = {
        view: {
          x: x - 2,
          y: rows.getDimensionLeftBoundaryByIndex(2) + (config.sheetOffsetY ?? 24) + 2,
        },
      };
      editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Update, point: destination });
      editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Release, point: destination });
      const values = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2].map((row) => values.getItem(row, 1)?.value)).toEqual([12.34, 12.34, 12.34]);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 1], end: [2, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-929 extends a numeric series while preserving one-step undo', () => {
    const { editor } = createEditor(6, 3, (state) => {
      state.sheetData.addItem(0, 1, { type: 'number', value: 1 });
      state.sheetData.addItem(1, 1, { type: 'number', value: 2 });
    });
    try {
      editor.commands.run(FillSheetRangeCommand, { source: { start: [0, 1], end: [1, 1] }, target: [4, 1] });
      const values = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3, 4].map((row) => values.getItem(row, 1)?.value)).toEqual([1, 2, 3, 4, 5]);
      editor.commands.run(UndoSheetCommand, undefined);
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(2, 1)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('INT15-019 extends a numeric series across columns with one-step undo', () => {
    const { editor } = createEditor(3, 6, (state) => {
      state.sheetData.addItem(0, 0, { type: 'number', value: 1 });
      state.sheetData.addItem(0, 1, { type: 'number', value: 2 });
    });
    try {
      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [0, 0], end: [0, 1] }, target: [0, 3],
      });
      let cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3].map((col) => cells.getItem(0, col)?.value)).toEqual([1, 2, 3, 4]);
      editor.commands.run(UndoSheetCommand, undefined);
      cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3].map((col) => cells.getItem(0, col)?.value ?? null)).toEqual([1, 2, null, null]);
    } finally {
      editor.destroy();
    }
  });

  it('INT15-019 extends a descending numeric series across columns', () => {
    const { editor } = createEditor(3, 6, (state) => {
      state.sheetData.addItem(0, 0, { type: 'number', value: 6 });
      state.sheetData.addItem(0, 1, { type: 'number', value: 4 });
    });
    try {
      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [0, 0], end: [0, 1] }, target: [0, 3],
      });
      const cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3].map((col) => cells.getItem(0, col)?.value)).toEqual([6, 4, 2, 0]);
    } finally {
      editor.destroy();
    }
  });

  it('INT15-022 extends text suffix numbers while preserving the source and undo', () => {
    const { editor } = createEditor(6, 3, (state) => {
      state.sheetData.addItem(0, 0, { type: 'string', value: 'Item1' });
      state.sheetData.addItem(1, 0, { type: 'string', value: 'Item2' });
    });
    try {
      editor.commands.run(FillSheetRangeCommand, {
        source: { start: [0, 0], end: [1, 0] }, target: [3, 0],
      });
      let cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3].map((row) => cells.getItem(row, 0)?.value)).toEqual(['Item1', 'Item2', 'Item3', 'Item4']);
      editor.commands.run(UndoSheetCommand, undefined);
      cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3].map((row) => cells.getItem(row, 0)?.value ?? null)).toEqual(['Item1', 'Item2', null, null]);
    } finally {
      editor.destroy();
    }
  });

  it('INT15-022 preserves numeric suffix width and copies ordinary text', () => {
    const { editor } = createEditor(5, 3, (state) => {
      state.sheetData.addItem(0, 0, { type: 'string', value: 'Case07' });
      state.sheetData.addItem(1, 0, { type: 'string', value: 'Case08' });
      state.sheetData.addItem(0, 1, { type: 'string', value: 'Alpha' });
      state.sheetData.addItem(1, 1, { type: 'string', value: 'Beta' });
    });
    try {
      for (const col of [0, 1]) {
        editor.commands.run(FillSheetRangeCommand, {
          source: { start: [0, col], end: [1, col] }, target: [3, col],
        });
      }
      const cells = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3].map((row) => cells.getItem(row, 0)?.value)).toEqual(['Case07', 'Case08', 'Case09', 'Case10']);
      expect([0, 1, 2, 3].map((row) => cells.getItem(row, 1)?.value)).toEqual(['Alpha', 'Beta', 'Alpha', 'Beta']);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-928 keeps a vertical fill within its source column near the viewport edge', () => {
    const { editor, core, selection } = createEditor(8, 5, (state) => {
      state.sheetData.addItem(0, 1, { type: 'number', value: 1 });
      state.sheetData.addItem(1, 1, { type: 'number', value: 2 });
    });
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 250, height: 250 });
      editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [1, 1] });
      const rows = readSheetRowSizes(core.getDataEngine())!;
      const columns = readSheetColumnSizes(core.getDataEngine())!;
      const config = core.configEngine.getDefaultConfig();
      const x = columns.getDimensionRightBoundaryByIndex(1) + (config.sheetOffsetX ?? 50);
      const y = rows.getDimensionRightBoundaryByIndex(1) + (config.sheetOffsetY ?? 24);
      expect(
        selection.onMouseDown(core, {
          target: { properties: { region: CellRegion.Grid } },
          origin: { offsetX: x, offsetY: y },
        } as never),
      ).toBe(false);
      const destination = {
        view: { x: x + 3, y: rows.getDimensionLeftBoundaryByIndex(4) + (config.sheetOffsetY ?? 24) + 2 },
      };
      editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Update, point: destination });
      editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Release, point: destination });
      const values = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([2, 3, 4].map((row) => values.getItem(row, 1)?.value)).toEqual([3, 4, 5]);
      expect(values.getItem(4, 2)).toBeNull();
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 1], end: [4, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-933 double-clicks the handle to fill through adjacent continuous data', () => {
    const { editor, core, selection, cellEditor } = createEditor(8, 4, (state) => {
      state.sheetData.addItem(0, 2, { type: 'string', value: 'seed' });
      for (let row = 0; row <= 4; row++) state.sheetData.addItem(row, 1, { type: 'string', value: 'adjacent' });
    });
    try {
      editor.commands.run(ResizeSheetViewportCommand, { width: 450, height: 400 });
      editor.commands.run(SelectRangeCommand, { anchor: [0, 2], focus: [0, 2] });
      const rows = readSheetRowSizes(core.getDataEngine())!;
      const columns = readSheetColumnSizes(core.getDataEngine())!;
      const config = core.configEngine.getDefaultConfig();
      const event = {
        target: { properties: { region: CellRegion.Grid, startRowIndex: 0, startColIndex: 2 } },
        origin: {
          offsetX: columns.getDimensionRightBoundaryByIndex(2) + (config.sheetOffsetX ?? 50),
          offsetY: rows.getDimensionRightBoundaryByIndex(0) + (config.sheetOffsetY ?? 24),
        },
      };
      expect(selection.onMouseDown(core, { ...event, clickCount: 2 } as never)).toBe(false);
      expect(cellEditor.onDblClick(core, event as never)).toBe(false);
      const values = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect([0, 1, 2, 3, 4].map((row) => values.getItem(row, 2)?.value)).toEqual(Array(5).fill('seed'));
      expect(values.getItem(5, 2)).toBeNull();
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 2], end: [4, 2] });
      expect(editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-247 retains disjoint cells after Command-click', () => {
    const { editor, core, selection, keyboard } = createEditor(5, 5, (state) => {
      state.sheetData.addItem(3, 3, { type: 'string', value: 'other' });
    });
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      selection.onMouseDown(core, {
        target: {
          properties: { region: CellRegion.Grid, startRowIndex: 3, endRowIndex: 3, startColIndex: 3, endColIndex: 3 },
        },
        origin: { metaKey: true },
      } as never);
      selection.onMouseUp(core, {} as never);
      expect(editor.queries.run(GetSelections, undefined)).toEqual([
        { start: [1, 1], end: [1, 1] },
        { start: [3, 3], end: [3, 3] },
      ]);
      keyboard.handlers.onDelete?.();
      const cleared = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(cleared.getItem(1, 1)).toBeNull();
      expect(cleared.getItem(3, 3)).toBeNull();
      editor.commands.run(UndoSheetCommand, undefined);
      const restored = editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData;
      expect(restored.getItem(1, 1)?.value).toBe('keep');
      expect(restored.getItem(3, 3)?.value).toBe('other');
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      expect(editor.queries.run(GetSelections, undefined)).toEqual([{ start: [0, 0], end: [0, 0] }]);
    } finally {
      editor.destroy();
    }
  });

  it('BUG-073 and BUG-074 select the active row or column', () => {
    const { editor, keyboard } = createEditor();
    try {
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onSelectRow?.();
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [1, 0], end: [1, 2] });
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboard.handlers.onSelectColumn?.();
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 1], end: [2, 1] });
    } finally {
      editor.destroy();
    }
  });

  it('BUG-246 extends the existing selection with Shift+click', () => {
    const { editor, core, selection } = createEditor();
    const pointer = (row: number, col: number, shiftKey = false) => ({
      origin: { shiftKey },
      target: {
        properties: {
          region: CellRegion.Grid,
          startRowIndex: row,
          endRowIndex: row,
          startColIndex: col,
          endColIndex: col,
        },
      },
    });
    try {
      selection.onMouseDown(core, pointer(0, 0) as never);
      selection.onMouseUp(core, pointer(0, 0) as never);
      selection.onMouseDown(core, pointer(2, 2, true) as never);
      expect(editor.queries.run(GetSelection, undefined)).toEqual({ start: [0, 0], end: [2, 2] });
    } finally {
      editor.destroy();
    }
  });
});
