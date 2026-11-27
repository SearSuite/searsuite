import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { type Rect } from '@searsuite/sear-foundation-rect';
import { SheetClipboardTransferRegistry, SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';
import { CellClipboardCodecRegistry, SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';

import { LocalActionCommand, SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetInteractionStore } from '@searsuite/sear-assembly-plugin';
import {
  SheetRangeMoveStatus,
  SheetRangeMoveRejectedError,
  type SheetRangeMoveAnalysis,
  type SheetMoveRange,
} from '@searsuite/sear-assembly-plugin';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import { CursorEngine, CursorRegistry, CursorToken } from '@searsuite/sear-render-cursor';
import { PointerCapture, KeyboardRouter, type PointerCapturePoint } from '@searsuite/sear-render-input';
import { ReadSheetCellDataQuery, readSheetRowSizes, readSheetColumnSizes } from '@searsuite/sear-domain-sheet';
import { CellRegion, CellRenderType, type CellProperties } from '@searsuite/sear-render-registry';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { SheetHighlightRegistry } from '../highlight/SheetHighlightRegistry';
import { SheetDragAxis } from '@searsuite/sear-plugin-selection';
import { resolveAxisInsertionBoundary } from './resolveAxisInsertionBoundary';
import { commitAxisDrag } from '@searsuite/sear-plugin-selection';
import { createAxisDragHighlight } from './SheetAxisDragView';
import { MoveSheetRangeCommand } from '@searsuite/sear-plugin-selection';
import { AnalyzeSheetRangeMove } from '@searsuite/sear-plugin-selection';
import { createRangeMovePreview } from './createRangeMovePreview';
import { HandleSheetRangeDragCommand, SheetRangeDragAction, type SheetRangeDragInput } from './SheetRangeDragCommand';
import { FillSheetRangeCommand } from '@searsuite/sear-plugin-selection';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';

interface RangeDragSession {
  readonly mode: 'move' | 'fill';
  readonly source: SheetMoveRange;
  target: [number, number];
  pointer: PointerCapturePoint;
  readonly origin: PointerCapturePoint;
  readonly startScrollX: number;
  fillDirection: 'row' | 'column' | null;
  readonly axis: SheetDragAxis | null;
  before: number;
  analysis: SheetRangeMoveAnalysis | null;
}

/** Owns one local range-border gesture; document changes enter through the move command. */
@Injectable()
export class SheetRangeDrag {
  readonly #queries: SheetQueryRegistry;
  readonly #coordinates: CoordinateEngine;
  readonly #pointer: PointerCapture;
  readonly #keyboard: KeyboardRouter;
  readonly #cursorRules: CursorRegistry;
  readonly #cursor: CursorEngine;
  readonly #highlights: SheetHighlightRegistry;
  readonly #platform: Platform;
  readonly #interactions: SheetInteractionStore;
  readonly #inputValidation: SheetCellInputValidationRegistry;
  readonly #cellCodecs: CellClipboardCodecRegistry;
  readonly #formats: SheetFormatTransferRegistry;
  readonly #ownerData: SheetClipboardTransferRegistry;

  public static readonly symbol = Symbol.for('SheetRangeDrag');
  #core: SearCoreSheet | null = null;
  #readSelection: (() => Rect) | null = null;
  #session: RangeDragSession | null = null;
  #disposeCapture: (() => void) | null = null;
  #disposers: (() => void)[] = [];
  #frame: number | null = null;
  #generation = 0;
  #suppressDoubleClick = false;
  #destroyed = false;
  #interaction: UserInteractionService | undefined;
  readonly #commands: SheetCommandBus;
  #ownerToken: object | null = null;

  public constructor(
    @Inject(SheetCommandBus.symbol) commands: SheetCommandBus,
    @Inject(SheetQueryRegistry.symbol) queries: SheetQueryRegistry,
    @Inject(CoordinateEngine.symbol) coordinates: CoordinateEngine,
    @Inject(PointerCapture.symbol) pointer: PointerCapture,
    @Inject(KeyboardRouter.symbol) keyboard: KeyboardRouter,
    @Inject(CursorRegistry.symbol) cursorRules: CursorRegistry,
    @Inject(CursorEngine.symbol) cursor: CursorEngine,
    @Inject(SheetHighlightRegistry.symbol) highlights: SheetHighlightRegistry,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(SheetInteractionStore.symbol) interactions: SheetInteractionStore,
    @Inject(SheetCellInputValidationRegistry.symbol) inputValidation: SheetCellInputValidationRegistry,
    @Inject(CellClipboardCodecRegistry.symbol) cellCodecs: CellClipboardCodecRegistry,
    @Inject(SheetFormatTransferRegistry.symbol) formats: SheetFormatTransferRegistry,
    @Inject(SheetClipboardTransferRegistry.symbol) ownerData: SheetClipboardTransferRegistry,
  ) {
    this.#queries = queries;
    this.#coordinates = coordinates;
    this.#pointer = pointer;
    this.#keyboard = keyboard;
    this.#cursorRules = cursorRules;
    this.#cursor = cursor;
    this.#highlights = highlights;
    this.#platform = platform;
    this.#interactions = interactions;
    this.#inputValidation = inputValidation;
    this.#cellCodecs = cellCodecs;
    this.#formats = formats;
    this.#ownerData = ownerData;
    this.#commands = commands;
  }

  /** Binds the optional host-owned confirmation service during assembly. */
  public setUserInteraction(service: UserInteractionService | undefined): void {
    if (this.#ownerToken) throw new SearError('Sheet range drag interaction is already bound to an editor.');
    this.#interaction = service;
  }

  /** Routes local pointer and animation inputs through the editor command boundary. */
  public registerCommands(commands: SheetCommandBus): void {
    if (commands !== this.#commands) throw new SearError('Sheet range drag commands are already bound to an editor.');
    commands.register(
      HandleSheetRangeDragCommand,
      (input) => new LocalActionCommand(HandleSheetRangeDragCommand.id, () => this.#applyInput(input)),
    );
  }

  #applyInput(input: SheetRangeDragInput): void {
    if (this.#destroyed) return;
    switch (input.action) {
      case SheetRangeDragAction.Begin:
        this.#begin(input.point);
        break;
      case SheetRangeDragAction.FillBegin:
        this.#begin(input.point, true);
        break;
      case SheetRangeDragAction.Update:
        this.#update(input.point);
        break;
      case SheetRangeDragAction.Release:
        void this.#finish(input.point);
        break;
      case SheetRangeDragAction.Cancel:
        this.#cancel();
        break;
      case SheetRangeDragAction.Tick:
        this.#advanceScroll();
        break;
    }
  }

  #escape = (): boolean => {
    if (this.#destroyed) return false;
    const handled = this.#session !== null;
    this.#commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Cancel });
    return handled;
  };

  /** Installs editor-local cursor and preview contributions once Core is available. */
  public bind(core: SearCoreSheet, readSelection: () => Rect, ownerToken: object): void {
    if (this.#ownerToken || this.#destroyed) throw new SearError('Sheet range drag is already bound to an editor.');
    this.#ownerToken = ownerToken;
    this.#core = core;
    this.#readSelection = readSelection;
    this.#disposers.push(
      this.#cursorRules.registerPosition({
        key: 'sheet.selection.fill-handle',
        layer: 95,
        cursor: CursorToken.Copy,
        test: ({ world, view, target }) => target?.region === CellRegion.Grid && this.#hitsFillHandle(world, view),
      }),
    );
    this.#disposers.push(
      this.#cursorRules.registerPosition({
        key: 'sheet.selection.move',
        layer: 90,
        cursor: CursorToken.Grab,
        test: ({ world, view, target }) =>
          (target?.region === CellRegion.Grid && this.#hitsBorder(world, view)) ||
          this.#hitsSelectedHeader(world, view, target?.region),
      }),
    );
    this.#disposers.push(
      this.#highlights.register({
        key: 'sheet.selection.move-preview',
        getHighlights: () => {
          const session = this.#session;
          if (!session) return [];
          if (session.mode === 'fill')
            return [
              {
                start: [
                  Math.min(session.source.start[0], session.target[0]),
                  Math.min(session.source.start[1], session.target[1]),
                ],
                end: [
                  Math.max(session.source.end[0], session.target[0]),
                  Math.max(session.source.end[1], session.target[1]),
                ],
                stroke: '#16834b',
                strokeWidth: 2,
                fill: 'rgba(22, 131, 75, 0.08)',
                skipHit: true,
              },
            ];
          if (session.axis !== null) {
            const geometry = this.#geometry()!;
            return [
              createAxisDragHighlight(
                { ...session, axis: session.axis },
                geometry.rows.shape[1],
                geometry.columns.shape[1],
              ),
            ];
          }
          return session.analysis ? [createRangeMovePreview(session.analysis)] : [];
        },
      }),
    );
    this.#keyboard.subscribe({ onEscape: this.#escape });
    this.#disposers.push(
      this.#commands.subscribe((event) => {
        if (event.result?.pipeline.steps.some((step) => step.transaction?.operations.length)) {
          this.#commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Cancel });
        }
      }),
    );
  }

  public isActive(): boolean {
    return this.#session !== null;
  }

  /** Starts on selection borders or already selected axis headers. */
  public onMouseDown(event: EventWithOffsetAndTarget<CellProperties>): boolean {
    if (!this.#core || this.#destroyed || !event.target) return false;
    if ((event.clickCount ?? event.origin.detail ?? 0) < 2) this.#suppressDoubleClick = false;
    const { offsetX, offsetY } = event.origin;
    const world = this.#coordinates.screenToWorld(offsetX, offsetY);
    const view = this.#coordinates.screenToView(offsetX, offsetY);
    const target = event.target.properties;
    if (target.region === CellRegion.Grid) {
      if (this.#hitsFillHandle(world, view)) {
        if ((event.clickCount ?? event.origin.detail ?? 0) >= 2) {
          this.onFillHandleDoubleClick(event);
          this.#suppressDoubleClick = true;
          return true;
        }
        this.#commands.run(HandleSheetRangeDragCommand, {
          action: SheetRangeDragAction.FillBegin,
          point: { view: { x: offsetX, y: offsetY } },
        });
        return true;
      }
      if (!this.#hitsBorder(world, view)) return false;
    } else {
      if (!this.#hitsSelectedHeader(world, view, target.region)) return false;
      // Higher-layer handle rules keep resize and hidden-marker gestures available.
      const properties: CellProperties = { ...target, type: target.type ?? CellRenderType.Affix };
      if (
        this.#cursorRules.resolve(properties, {
          core: this.#core,
          origin: event.origin,
          world,
          view,
          target: properties,
        }) !== CursorToken.Grab
      )
        return false;
    }
    this.#commands.run(HandleSheetRangeDragCommand, {
      action: SheetRangeDragAction.Begin,
      point: { view: { x: offsetX, y: offsetY } },
    });
    return true;
  }

  /** Fills down to the end of a continuous adjacent column when the handle is double-clicked. */
  public onFillHandleDoubleClick(event: EventWithOffsetAndTarget<CellProperties>): boolean {
    if (this.#suppressDoubleClick) {
      this.#suppressDoubleClick = false;
      return true;
    }
    if (!this.#core || !this.#readSelection || event.target?.properties.region !== CellRegion.Grid) return false;
    const { offsetX, offsetY } = event.origin;
    if (
      !this.#hitsFillHandle(
        this.#coordinates.screenToWorld(offsetX, offsetY),
        this.#coordinates.screenToView(offsetX, offsetY),
      )
    )
      return false;
    const range = this.#readSelection();
    const source = {
      start: [...range.getPoint(0)] as [number, number],
      end: [...range.getPoint(1)] as [number, number],
    };
    const cells = this.#queries.run(ReadSheetCellDataQuery, void 0);
    const adjacent = [source.start[1] - 1, source.end[1] + 1].find(
      (col) => col >= 0 && col < cells.shape[1] && cells.getItem(source.start[0], col),
    );
    if (adjacent === undefined) return true;
    let last = source.end[0];
    while (last + 1 < cells.shape[0] && cells.getItem(last + 1, adjacent)) last++;
    if (last > source.end[0]) {
      try {
        this.#commands.run(FillSheetRangeCommand, { source, target: [last, source.end[1]] });
      } catch (error) {
        void this.#reportFillError(error);
        return true;
      }
      this.#commands.run(SelectRangeCommand, { anchor: source.start, focus: [last, source.end[1]] });
    }
    return true;
  }

  #begin(point: PointerCapturePoint, fill = false): void {
    if (!this.#core || !this.#readSelection) return;
    const world = this.#coordinates.screenToWorld(point.view.x, point.view.y);
    const view = this.#coordinates.screenToView(point.view.x, point.view.y);
    if (
      fill
        ? !this.#hitsFillHandle(world, view)
        : !this.#hitsBorder(world, view) && !this.#hitsSelectedHeader(world, view)
    )
      return;
    const selection = this.#readSelection!();
    const source = {
      start: [...selection.getPoint(0)] as [number, number],
      end: [...selection.getPoint(1)] as [number, number],
    };
    this.#cancel();
    this.#keyboard.subscribe({ onEscape: this.#escape });
    const axis = this.#selectedAxis();
    this.#session = {
      mode: fill ? 'fill' : 'move',
      source,
      target: [...source.start],
      pointer: point,
      origin: point,
      startScrollX: this.#core.renderEngine.scrollManager.getState().x,
      fillDirection: null,
      axis,
      before: source.start[axis ?? 0],
      analysis:
        fill || axis !== null ? null : this.#queries.run(AnalyzeSheetRangeMove, { source, target: source.start }),
    };
    this.#cursor.override(fill ? CursorToken.Copy : CursorToken.Grabbing);
    this.#disposeCapture = this.#pointer.start({
      onMove: (point) =>
        this.#commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Update, point }),
      onRelease: (point) => {
        this.#commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Release, point });
      },
    });
    this.#highlights.invalidate();
    this.#scheduleScroll();
  }

  #geometry() {
    if (!this.#core) return null;
    const rows = readSheetRowSizes(this.#core.getDataEngine());
    const columns = readSheetColumnSizes(this.#core.getDataEngine());
    const config = this.#core.configEngine.getDefaultConfig() as Partial<SheetConfig>;
    return rows && columns ? { rows, columns, x: config.sheetOffsetX ?? 50, y: config.sheetOffsetY ?? 24 } : null;
  }

  #hitsBorder(world: { x: number; y: number }, view: { x: number; y: number }): boolean {
    const geometry = this.#geometry();
    const range = this.#readSelection?.();
    if (!geometry || !range || range.getPoint(0)[0] < 0 || view.x <= geometry.x || view.y <= geometry.y) return false;
    if (this.#interactions.getState().editSession) return false;
    const start = range.getPoint(0);
    const end = range.getPoint(1);
    if (
      start[0] === 0 &&
      end[0] === geometry.rows.shape[1] - 1 &&
      start[1] === 0 &&
      end[1] === geometry.columns.shape[1] - 1
    )
      return false;
    const left = geometry.columns.getDimensionLeftBoundaryByIndex(start[1]) + geometry.x;
    const right = geometry.columns.getDimensionRightBoundaryByIndex(end[1]) + geometry.x;
    const top = geometry.rows.getDimensionLeftBoundaryByIndex(start[0]) + geometry.y;
    const bottom = geometry.rows.getDimensionRightBoundaryByIndex(end[0]) + geometry.y;
    const tolerance = 4;
    const axis = this.#selectedAxis();
    if (axis === SheetDragAxis.Row)
      return Math.abs(world.y - top) <= tolerance || Math.abs(world.y - bottom) <= tolerance;
    if (axis === SheetDragAxis.Column)
      return Math.abs(world.x - left) <= tolerance || Math.abs(world.x - right) <= tolerance;
    return (
      (world.x >= left - tolerance &&
        world.x <= right + tolerance &&
        (Math.abs(world.y - top) <= tolerance || Math.abs(world.y - bottom) <= tolerance)) ||
      (world.y >= top - tolerance &&
        world.y <= bottom + tolerance &&
        (Math.abs(world.x - left) <= tolerance || Math.abs(world.x - right) <= tolerance))
    );
  }

  #hitsFillHandle(world: { x: number; y: number }, view: { x: number; y: number }): boolean {
    const geometry = this.#geometry();
    const range = this.#readSelection?.();
    if (!geometry || !range || range.getPoint(0)[0] < 0 || view.x <= geometry.x || view.y <= geometry.y) return false;
    if (this.#interactions.getState().editSession || this.#selectedAxis() !== null) return false;
    const end = range.getPoint(1);
    const right = geometry.columns.getDimensionRightBoundaryByIndex(end[1]) + geometry.x;
    const bottom = geometry.rows.getDimensionRightBoundaryByIndex(end[0]) + geometry.y;
    return Math.abs(world.x - right) <= 6 && Math.abs(world.y - bottom) <= 6;
  }

  #selectedAxis(): SheetDragAxis | null {
    const geometry = this.#geometry();
    const selection = this.#readSelection?.();
    if (!geometry || !selection) return null;
    const start = selection.getPoint(0);
    const end = selection.getPoint(1);
    if (start[0] < 0 || start[1] < 0) return null;
    if (
      start[0] === 0 &&
      end[0] === geometry.rows.shape[1] - 1 &&
      start[1] === 0 &&
      end[1] === geometry.columns.shape[1] - 1
    )
      return null;
    if (start[1] === 0 && end[1] === geometry.columns.shape[1] - 1) return SheetDragAxis.Row;
    if (start[0] === 0 && end[0] === geometry.rows.shape[1] - 1) return SheetDragAxis.Column;
    return null;
  }

  #hitsSelectedHeader(world: { x: number; y: number }, view: { x: number; y: number }, region?: CellRegion): boolean {
    const geometry = this.#geometry();
    const selection = this.#readSelection?.();
    const axis = this.#selectedAxis();
    if (!geometry || !selection || axis === null || this.#interactions.getState().editSession) return false;
    const rowHeader = view.x >= 0 && view.x < geometry.x && view.y > geometry.y;
    const columnHeader = view.y >= 0 && view.y < geometry.y && view.x > geometry.x;
    if (axis === SheetDragAxis.Row ? !rowHeader : !columnHeader) return false;
    if (
      region !== undefined &&
      region !== (axis === SheetDragAxis.Row ? CellRegion.RowHeader : CellRegion.ColumnHeader)
    )
      return false;
    const dimensions = axis === SheetDragAxis.Row ? geometry.rows : geometry.columns;
    const position = axis === SheetDragAxis.Row ? world.y - geometry.y : world.x - geometry.x;
    return (
      position >= dimensions.getDimensionLeftBoundaryByIndex(selection.getPoint(0)[axis]) &&
      position < dimensions.getDimensionRightBoundaryByIndex(selection.getPoint(1)[axis])
    );
  }

  #cellAt(world: { x: number; y: number }): [number, number] {
    const geometry = this.#geometry()!;
    const containingCell = (dimensions: typeof geometry.rows, coordinate: number): number => {
      const last = dimensions.shape[1] - 1;
      const position = Math.max(0, Math.min(dimensions.getDimensionRightBoundaryByIndex(last), coordinate));
      const index = dimensions.getRightBoundaryColIndexByDimension(position);
      const right = dimensions.getDimensionRightBoundaryByIndex(index);
      // Shared edges belong to the following cell; the outer sheet edge stays in the last cell.
      return index < last && position >= right ? index + 1 : index;
    };
    return [
      containingCell(geometry.rows, world.y - geometry.y),
      containingCell(geometry.columns, world.x - geometry.x),
    ];
  }

  #update(point: PointerCapturePoint, refresh = false): void {
    const session = this.#session;
    const geometry = this.#geometry();
    if (!session || !geometry) return;
    session.pointer = point;
    const world = this.#coordinates.screenToWorld(point.view.x, point.view.y);
    if (session.axis !== null) {
      session.before =
        session.axis === SheetDragAxis.Row
          ? resolveAxisInsertionBoundary(geometry.rows, world.y - geometry.y)
          : resolveAxisInsertionBoundary(geometry.columns, world.x - geometry.x);
      this.#highlights.invalidate();
      return;
    }
    const cell = this.#cellAt(world);
    if (session.mode === 'fill') {
      if (!session.fillDirection) {
        const dx = point.view.x - session.origin.view.x;
        const dy = point.view.y - session.origin.view.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 6)
          session.fillDirection = Math.abs(dy) >= Math.abs(dx) ? 'row' : 'column';
      }
      session.target =
        session.fillDirection === 'row'
          ? [cell[0], session.source.end[1]]
          : session.fillDirection === 'column'
          ? [session.source.end[0], cell[1]]
          : cell;
      this.#highlights.invalidate();
      return;
    }
    const target: [number, number] = [
      Math.max(0, Math.min(geometry.rows.shape[1] - 1 - session.source.end[0] + session.source.start[0], cell[0])),
      Math.max(0, Math.min(geometry.columns.shape[1] - 1 - session.source.end[1] + session.source.start[1], cell[1])),
    ];
    if (!refresh && session.target[0] === target[0] && session.target[1] === target[1]) return;
    session.target = target;
    session.analysis = this.#queries.run(AnalyzeSheetRangeMove, { source: session.source, target });
    this.#cursor.override(
      session.analysis.status === SheetRangeMoveStatus.Blocked ? CursorToken.NotAllowed : CursorToken.Grabbing,
    );
    this.#highlights.invalidate();
  }

  #scheduleScroll(): void {
    this.#frame = this.#platform.requestAnimationFrame(() => {
      this.#frame = null;
      if (!this.#destroyed) this.#commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Tick });
    });
  }

  #advanceScroll(): void {
    const session = this.#session;
    const geometry = this.#geometry();
    if (!session || !geometry || !this.#core) return;
    const view = this.#coordinates.screenToView(session.pointer.view.x, session.pointer.view.y);
    const scroll = this.#core.renderEngine.scrollManager;
    const [width, height] = scroll.getShape();
    const speed = (value: number, start: number, end: number) => (value < start + 24 ? -12 : value > end - 24 ? 12 : 0);
    const state = scroll.getState();
    const dx =
      session.axis === SheetDragAxis.Row || (session.mode === 'fill' && session.fillDirection !== 'column')
        ? 0
        : speed(view.x, geometry.x, width);
    const dy =
      session.axis === SheetDragAxis.Column ||
      (session.mode === 'fill' && session.fillDirection === null) ||
      session.fillDirection === 'column'
        ? 0
        : speed(view.y, geometry.y, height);
    if (dx || dy) {
      scroll.scrollTo(state.x + dx, state.y + dy);
      this.#update(session.pointer);
    }
    this.#scheduleScroll();
  }

  async #finish(point: PointerCapturePoint): Promise<void> {
    this.#update(point, true);
    const session = this.#session;
    this.#clearGesture();
    if (session?.mode === 'fill') {
      if (session.fillDirection && !session.target.every((value, axis) => value === session.source.end[axis])) {
        try {
          this.#commands.run(FillSheetRangeCommand, { source: session.source, target: session.target });
        } catch (error) {
          await this.#reportFillError(error);
          return;
        }
        this.#commands.run(SelectRangeCommand, {
          anchor: [
            Math.min(session.source.start[0], session.target[0]),
            Math.min(session.source.start[1], session.target[1]),
          ],
          focus: [
            Math.max(session.source.end[0], session.target[0]),
            Math.max(session.source.end[1], session.target[1]),
          ],
        });
      }
      if (session.fillDirection === 'row' && this.#core) {
        const scroll = this.#core.renderEngine.scrollManager;
        scroll.scrollTo(session.startScrollX, scroll.getState().y);
      }
      return;
    }
    if (session?.axis !== null && session?.axis !== undefined) {
      try {
        commitAxisDrag(this.#commands, { ...session, axis: session.axis });
      } catch (error) {
        this.#platform.warn('Sheet axis move rejected.', error);
        if (!this.#destroyed && error instanceof SearError) {
          await this.#interaction
            ?.confirm({
              title: 'Cannot reorder rows or columns',
              message: error.message,
              confirmLabel: 'OK',
              cancelLabel: 'Close',
            })
            .catch((feedbackError) => this.#platform.warn('Sheet axis move feedback failed.', feedbackError));
        }
      }
      return;
    }
    if (!session || session.target.every((value, axis) => value === session.source.start[axis])) return;
    const generation = ++this.#generation;
    const input = { source: session.source, target: session.target };
    try {
      const analysis = this.#queries.run(AnalyzeSheetRangeMove, input);
      if (analysis.status === SheetRangeMoveStatus.Blocked) throw new SheetRangeMoveRejectedError(analysis);
      const conflict = analysis.status === SheetRangeMoveStatus.RequiresConfirmation;
      if (
        conflict &&
        !(await this.#interaction?.confirm({
          title: 'Move cells',
          message: 'The destination contains data. Replace it?',
          confirmLabel: 'Replace',
          cancelLabel: 'Cancel',
        }))
      )
        return;
      if (this.#destroyed || generation !== this.#generation) return;
      this.#commands.run(MoveSheetRangeCommand, { ...input, overwrite: conflict });
    } catch (error) {
      this.#platform.warn('Sheet range move rejected.', error);
      if (!this.#destroyed && generation === this.#generation && error instanceof SearError) {
        await this.#interaction
          ?.confirm({
            title: 'Cannot move cells',
            message: error.message,
            confirmLabel: 'OK',
            cancelLabel: 'Close',
          })
          .catch((feedbackError) => this.#platform.warn('Sheet range move feedback failed.', feedbackError));
      }
    }
  }

  async #reportFillError(error: unknown): Promise<void> {
    this.#platform.warn('Sheet range fill rejected.', error);
    if (!this.#destroyed && error instanceof SearError) {
      await this.#interaction
        ?.confirm({
          title: 'Cannot fill cells',
          message: error.message,
          confirmLabel: 'OK',
          cancelLabel: 'Close',
        })
        .catch((feedbackError) => this.#platform.warn('Sheet range fill feedback failed.', feedbackError));
    }
  }

  #clearGesture(): void {
    this.#disposeCapture?.();
    this.#disposeCapture = null;
    if (this.#frame !== null) this.#platform.cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#session = null;
    this.#cursor.override(null);
    this.#highlights.invalidate();
  }

  #cancel(): void {
    this.#generation++;
    this.#clearGesture();
  }

  /** Idempotently releases preview, cursor, pointer capture and animation resources. */
  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#ownerToken && ownerToken !== this.#ownerToken) {
      throw new SearError('Sheet range drag destruction requires its editor owner.');
    }
    this.#destroyed = true;
    this.#cancel();
    this.#disposers
      .splice(0)
      .reverse()
      .forEach((dispose) => dispose());
    this.#core = null;
    this.#readSelection = null;
  }
}
