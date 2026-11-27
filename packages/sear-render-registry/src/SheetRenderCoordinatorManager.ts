import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { PositionRectProps } from '@searsuite/sear-foundation-rect';
import { NodeFactory } from './NodeFactory';
import { SheetNodeFactory } from './SheetNodeFactory';

import { RendererRegistry } from './RendererRegistry';
import { SheetRendererRegistry } from './SheetRendererRegistry';
import { CellProperties, Cell, CellContext, IFormulaResultProvider } from './Cell';
import { IFormulaRichResultProvider } from '@searsuite/sear-domain-formula-engine';
import { FixBoxNode, Node } from '@searsuite/sear-render-node';
import { Platform } from '@searsuite/sear-foundation-platform';
import {
  assertCellExtensionWrite,
  createDefaultCellFormatLocaleProvider,
  ICellFormatLocaleProvider,
} from '@searsuite/sear-domain-cell-types';

/** Coordinates cell projection and rendering for a Sheet frame. */
@Injectable()
export class SheetRenderCoordinatorManager {
  readonly #formulaResultProvider: IFormulaResultProvider;
  readonly #platform: Platform | undefined;
  readonly #cellFormatLocaleProvider: ICellFormatLocaleProvider;
  readonly #formulaRichResultProvider: IFormulaRichResultProvider | undefined;

  /** DI token for resolving SheetRenderCoordinatorManager. */
  public static readonly symbol: symbol = Symbol.for('SheetRenderCoordinatorManager');
  readonly #storedValueValidators = new Map<CellProperties['type'], (cell: CellProperties) => boolean>();

  /** Creates a SheetRenderCoordinatorManager instance. */
  constructor(
    @Inject(NodeFactory.symbol) public readonly nodeFactory: SheetNodeFactory,
    @Inject(RendererRegistry.symbol)
    public readonly rendererRegistry: SheetRendererRegistry<CellProperties>,
    @Inject(IFormulaResultProvider.symbol)
    formulaResultProvider: IFormulaResultProvider,
    @Inject(Platform.symbol) platform: Platform | undefined = undefined,
    @Inject(ICellFormatLocaleProvider.symbol)
    cellFormatLocaleProvider: ICellFormatLocaleProvider = createDefaultCellFormatLocaleProvider(),
    @Inject(IFormulaRichResultProvider.symbol)
    formulaRichResultProvider?: IFormulaRichResultProvider,
  ) {
    this.#formulaResultProvider = formulaResultProvider;
    this.#platform = platform;
    this.#cellFormatLocaleProvider = cellFormatLocaleProvider;
    this.#formulaRichResultProvider = formulaRichResultProvider;
  }

  /** Registers the stored value validator. */
  registerStoredValueValidator(type: CellProperties['type'], validator: (cell: CellProperties) => boolean): () => void {
    assertCellExtensionWrite(this);
    const previous = this.#storedValueValidators.get(type);
    this.#storedValueValidators.set(type, validator);
    const manager = this;
    return function unregisterStoredValueValidator(): void {
      assertCellExtensionWrite(manager);
      if (manager.#storedValueValidators.get(type) !== validator) return;
      if (previous) manager.#storedValueValidators.set(type, previous);
      else manager.#storedValueValidators.delete(type);
    };
  }

  // Register cell type
  /** Registers the type. */
  registerType<DataType extends CellProperties<unknown>, U>(
    type: CellProperties['type'],
    ctor: new (data: DataType, positionRect: PositionRectProps, properties: U, context?: CellContext) => Cell<DataType>,
  ): () => void {
    return this.nodeFactory.register(type, ctor);
  }

  // Register renderer
  /** Registers the renderer. */
  registerRenderer<T extends CellProperties>(
    type: T['type'],
    renderer: <U extends CellProperties>(cell: Cell<U>) => Node<CellProperties> | Node<CellProperties>[],
  ): () => void {
    return this.rendererRegistry.registerRenderer(type, renderer);
  }

  /** Registers a cell constructor and its default `Cell.render()` adapter together. */
  registerCell<DataType extends CellProperties<unknown>, U>(
    type: CellProperties['type'],
    ctor: new (data: DataType, positionRect: PositionRectProps, properties: U, context?: CellContext) => Cell<DataType>,
  ): () => void {
    const unregisterType = this.registerType(type, ctor);
    const unregisterRenderer = this.registerRenderer(type, function renderRegisteredSheetCell(cell) {
      return cell.render();
    });
    return function unregisterSheetCellRenderer(): void {
      unregisterRenderer();
      unregisterType();
    };
  }

  // Create cell instance
  /** Creates the value. */
  create<T extends CellProperties>(
    data: T,
    positionRect: PositionRectProps,
    properties: CellProperties,
    context: CellContext = {},
  ): Cell<T> | undefined {
    return this.nodeFactory.create(data, positionRect, properties, context) as Cell<T>;
  }

  /** Builds the explicit, read-only context shared by render and measurement paths. */
  createCellContext(row?: number, col?: number): CellContext {
    return {
      formulaResultProvider: this.#formulaResultProvider,
      ...(this.#formulaRichResultProvider && { formulaRichResultProvider: this.#formulaRichResultProvider }),
      cellFormatLocale: this.#cellFormatLocaleProvider.getCellFormatLocale(),
      ...(row !== void 0 && { row }),
      ...(col !== void 0 && { col }),
    };
  }

  // Render cell (by type and props)
  /** Projects and renders one visible Sheet cell. */
  renderCell<T extends CellProperties>(
    data: T,
    positionRect: PositionRectProps,
    properties: CellProperties,
    context: CellContext = {},
  ): Node<CellProperties> | Node<CellProperties>[] {
    const validator = this.#storedValueValidators.get(data.type);
    if (validator && !validator(data)) {
      this.#platform?.warn(
        `[Cell] Invalid stored value for cell type "${String(data.type)}". Rendering an empty fallback.`,
      );
      return new FixBoxNode(positionRect, properties);
    }
    const cell = this.create(data, positionRect, properties, context);
    if (!cell) throw new SearError(`Cell type not registered: ${data.type.toString()}`);
    return this.render(cell);
  }

  // Render created cell
  /** Renders SheetRenderCoordinatorManager scene output. */
  render<T extends CellProperties>(cell: Cell<T>): Node<CellProperties> | Node<CellProperties>[] {
    return this.rendererRegistry.render(cell);
  }
}
