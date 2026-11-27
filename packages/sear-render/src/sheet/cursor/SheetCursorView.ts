import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';

import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { RenderContext } from '@searsuite/sear-render-context';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import { CursorRegistry } from '@searsuite/sear-render-cursor';
import { CursorRuleKind } from '@searsuite/sear-render-cursor';
import { CursorEngine } from '@searsuite/sear-render-cursor';
import { CursorToken } from '@searsuite/sear-render-cursor';

const key = new PluginKey('SheetCursor');
interface ISheetCursorState {}

/** Projects Sheet interaction state into host cursor behavior. */
@Injectable()
export class SheetCursorView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  readonly #cursorRegistry: CursorRegistry;
  readonly #cursorEngine: CursorEngine;
  readonly #coordinates: CoordinateEngine;

  /** DI token for resolving SheetCursorView. */
  public static readonly symbol: symbol = Symbol.for('SheetCursorView');

  /** Creates a SheetCursorView instance. */
  constructor(
    @Inject(CursorRegistry.symbol)
    cursorRegistry: CursorRegistry,
    @Inject(CursorEngine.symbol) cursorEngine: CursorEngine,
    @Inject(CoordinateEngine.symbol) coordinates: CoordinateEngine,
    @Inject(RenderContext.symbol) renderContext: RenderContext,
  ) {
    super(key);
    this.#cursorRegistry = cursorRegistry;
    this.#cursorEngine = cursorEngine;
    this.#coordinates = coordinates;
    this.#cursorEngine.mount(renderContext.getRenderTarget());
    this.#installDefaultRules();
  }

  #installDefaultRules(): void {
    this.#cursorRegistry.register({
      kind: CursorRuleKind.Region,
      region: CellRegion.Grid,
      cursor: CursorToken.Cell,
    });
    this.#cursorRegistry.register({
      kind: CursorRuleKind.Region,
      region: CellRegion.RowHeader,
      cursor: CursorToken.RowSelect,
    });
    this.#cursorRegistry.register({
      kind: CursorRuleKind.Region,
      region: CellRegion.ColumnHeader,
      cursor: CursorToken.ColumnSelect,
    });
    this.#cursorRegistry.register({
      kind: CursorRuleKind.Region,
      region: CellRegion.Corner,
      cursor: CursorToken.Default,
    });
  }

  /**
   * Returns void (not false) so the event continues to propagate to downstream plugins
   * (selection, editor, etc.). See Guide.md §8: returning false blocks subsequent plugins.
   */
  public onMouseMove(_searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): void {
    const properties = event.target?.properties;
    const target = properties != null && this.#hasType(properties) ? properties : null;
    const { offsetX, offsetY } = event.origin;
    const token = this.#cursorRegistry.resolve(target, {
      core: _searCore,
      origin: event.origin,
      view: this.#coordinates.screenToView(offsetX, offsetY),
      world: this.#coordinates.screenToWorld(offsetX, offsetY),
      target,
    });
    this.#cursorEngine.apply(token);
  }

  /** Type guard: narrows Partial<CellProperties> → CellProperties by asserting the required field. */
  #hasType(p: Partial<CellProperties>): p is CellProperties {
    return p.type != null;
  }
}
