import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { CellProperties, CellRegion } from '@searsuite/sear-render-registry';
import { RenderContext } from '@searsuite/sear-render-context';
import { CoordinateEngine } from '@searsuite/sear-render-coord';
import { CursorRegistry } from '../CursorRegistry';
import { CursorRuleKind } from '../CursorRule';
import { CursorEngine } from '../CursorEngine';
import { CursorToken } from '../CursorToken';

const key = new PluginKey('SheetCursor');
interface ISheetCursorState {}

/** Projects Sheet interaction state into host cursor behavior. */
@Injectable()
export class SheetCursorPlugin extends Plugin<SearCoreSheet, CellProperties, ISheetCursorState> {
  readonly #cursorRegistry: CursorRegistry;
  readonly #cursorEngine: CursorEngine;
  readonly #coordinates: CoordinateEngine;

  /** DI token for resolving SheetCursorPlugin. */
  public static readonly symbol: symbol = Symbol.for('SheetCursorPlugin');

  /** Creates a SheetCursorPlugin instance. */
  constructor(
    @Inject(CursorRegistry.symbol)
    cursorRegistry: CursorRegistry,
    @Inject(CursorEngine.symbol) cursorEngine: CursorEngine,
    @Inject(CoordinateEngine.symbol) coordinates: CoordinateEngine,
    @Inject(RenderContext.symbol) renderContext: RenderContext,
  ) {
    super({ key, state: {} });
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

  /** Applies a transaction to SheetCursorPlugin state. */
  public apply(_state: ISheetCursorState, _tx: Transaction): ISheetCursorState | null {
    return null;
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

  /**
   * Returns null: this plugin produces no scene nodes.
   * Nothing is written to SceneGraph → DirtyTree, StickyRenderStrategy, and Hit Canvas
   * are completely unaffected (Rule.md §1.4, §1.5).
   */
  public render(): null {
    return null;
  }
  /** Registers the state. */
  public registerState() {
    return { key, state: {} };
  }
  /** Returns the plugin config. */
  public getPluginConfig() {
    return {};
  }
}
