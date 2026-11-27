import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type CellMatrixElement } from '@searsuite/sear-domain-sheet';
import { SheetInteractionStore } from '@searsuite/sear-assembly-plugin';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import {
  type CellKey,
  type Dependency,
  FormulaNodeKind,
  IFormulaStatusProvider,
} from '@searsuite/sear-domain-formula-engine';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  SheetHighlightRegistry,
  type SheetHighlightContext,
  type SheetRangeHighlight,
} from '../highlight/SheetHighlightRegistry';
import { type CellProperties } from '@searsuite/sear-render-registry';

import { readSheetDataMatrix } from '@searsuite/sear-domain-sheet';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-plugin-resize';

import { SearError } from '@searsuite/sear-foundation-error';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { fromCellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { FormulaCrossSheetHighlightSource } from '@searsuite/sear-plugin-formula';
import { formulaHighlightViewKey } from './FormulaHighlightConfig';
import {
  formulaReferenceHighlightConfig,
  getFormulaReferenceColor,
  type FormulaReferenceHighlightConfig,
} from './FormulaHighlightConfig';

const key = new PluginKey('SheetFormulaReferenceHighlight');
const formulaReferenceHighlightType = 'formula-reference-highlight';
const formulaDependentHighlightType = 'formula-dependent-highlight';
const referenceHighlightInset = 0.5;

/**
 * Highlights formula precedents and dependents for the active cell.
 *
 * This intentionally remains separate from Selection: formula dependency status
 * is optional, while Selection itself must stay independent of formula support.
 */
@Injectable()
export class SheetFormulaReferenceHighlightView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  readonly #statusProvider: IFormulaStatusProvider;
  readonly #configEngine: ConfigEngine;
  readonly #highlightRegistry: SheetHighlightRegistry;
  readonly #interactionStore: SheetInteractionStore;

  /** DI token for resolving SheetFormulaReferenceHighlightView. */
  public static readonly symbol = Symbol.for('SheetFormulaReferenceHighlightView');
  /** Stable plugin key for SheetFormulaReferenceHighlightView. */
  public static readonly pluginKey = key;
  /** Stable key for the formula-reference highlight contribution. */
  public static readonly highlightProviderKey = 'formula-selection-references';

  /** Draw above regular cells and below Selection's edit overlay. */
  public depth = 2;
  #crossSheetSource: FormulaCrossSheetHighlightSource | null = null;

  /** Creates a SheetFormulaReferenceHighlightView instance. */
  constructor(
    @Inject(IFormulaStatusProvider.symbol)
    statusProvider: IFormulaStatusProvider,
    @Inject(ConfigEngine.symbol) configEngine: ConfigEngine,
    @Inject(SheetHighlightRegistry.symbol)
    highlightRegistry: SheetHighlightRegistry,
    @Inject(SheetInteractionStore.symbol)
    interactionStore: SheetInteractionStore,
  ) {
    super(key);
    this.#statusProvider = statusProvider;
    this.#configEngine = configEngine;
    this.#highlightRegistry = highlightRegistry;
    this.#interactionStore = interactionStore;
    this.#highlightRegistry.register({
      key: SheetFormulaReferenceHighlightView.highlightProviderKey,
      getHighlights: this.#getFormulaReferenceHighlights.bind(this),
    });
  }

  public override registerConfig() {
    return [{ key: formulaHighlightViewKey, config: new ConfigUnit(formulaReferenceHighlightConfig) }];
  }

  /** Binds an optional workbook-owned reference source for this Sheet instance. */
  public bindCrossSheetSource(source: FormulaCrossSheetHighlightSource): void {
    if (this.hasRuntimeWriteBoundary()) {
      throw new SearError('Sheet formula highlight source cannot change after editor assembly.');
    }
    this.#crossSheetSource = source;
  }

  #getFormulaReferenceHighlights(
    context: Parameters<SheetFormulaReferenceHighlightView['getHighlights']>[0],
  ): SheetRangeHighlight[] {
    return this.getHighlights(context);
  }

  /** The provider contract consumed by SheetHighlightView. */
  public getHighlights(context: SheetHighlightContext): SheetRangeHighlight[] {
    const interaction = this.#interactionStore.getState();
    if (
      interaction.editSession ||
      (interaction.suppressedSelectionRevision !== null &&
        interaction.selectionRevision <= interaction.suppressedSelectionRevision)
    )
      return [];
    const { searCore } = context;
    const selection = interaction.selection;
    const dataEngine = searCore.getDataEngine();
    const sheetData = readSheetDataMatrix(dataEngine);
    const rowSizes = readSheetRowSizes(dataEngine);
    const columnSizes = readSheetColumnSizes(dataEngine);
    if (!sheetData || !rowSizes || !columnSizes) return [];
    const shape = {
      rowCount: rowSizes.shape[1],
      colCount: columnSizes.shape[1],
    };
    const crossSheetHighlights =
      this.#crossSheetSource
        ?.getReferences(interaction.selectionRevision, selection?.source)
        .flatMap((reference) => this.#createRangeHighlight(reference.start, reference.end, reference.index)) ?? [];
    const visibleCrossSheetHighlights = crossSheetHighlights.filter(({ start, end }) =>
      this.#isWithinShape(start, end, shape),
    );
    if (!selection || selection.focus[0] < 0 || selection.focus[1] < 0) return visibleCrossSheetHighlights;

    const [row, col] = selection.focus;
    const cell = sheetData.getItem(row, col);
    const status = this.#statusProvider.getFormulaCellStatus(row, col);
    const dependencyHighlights = this.#isFormula(cell)
      ? status.dependencies.flatMap((dependency, index) => this.#createDependencyHighlight(dependency, index, shape))
      : [];
    const dependentHighlights = status.dependents.flatMap((dependent, index) =>
      this.#createDependentHighlight(dependent, index + dependencyHighlights.length, {
        rowCount: rowSizes.shape[1],
        colCount: columnSizes.shape[1],
      }),
    );
    return [...dependencyHighlights, ...dependentHighlights, ...visibleCrossSheetHighlights].filter(({ start, end }) =>
      this.#isWithinShape(start, end, shape),
    );
  }

  #createDependencyHighlight(
    dependency: Dependency,
    referenceIndex: number,
    shape: { rowCount: number; colCount: number },
  ): SheetRangeHighlight[] {
    const bounds = this.#resolveDependencyBounds(dependency, shape);
    if (!bounds) return [];
    const { start, end } = bounds;
    return this.#createRangeHighlight(start, end, referenceIndex);
  }

  #createRangeHighlight(start: [number, number], end: [number, number], referenceIndex: number): SheetRangeHighlight[] {
    const [startRow, startCol] = start;
    const [endRow, endCol] = end;
    const config = this.#getConfig();
    const color = getFormulaReferenceColor(referenceIndex, config.referenceColors) as HexColor;
    return [
      {
        start: [startRow, startCol],
        end: [endRow, endCol],
        type: formulaReferenceHighlightType,
        depth: this.depth,
        inset: referenceHighlightInset,
        strokeWidth: 1,
        stroke: color,
        fill: this.#withOpacity(color, config.referenceFillOpacity),
        skipHit: true,
      },
    ];
  }

  #createDependentHighlight(
    dependent: CellKey,
    referenceIndex: number,
    shape: { rowCount: number; colCount: number },
  ): SheetRangeHighlight[] {
    const [row, col] = fromCellKey(dependent);
    if (!this.#isWithinShape([row, col], [row, col], shape)) return [];
    const config = this.#getConfig();
    const color = getFormulaReferenceColor(referenceIndex, config.referenceColors) as HexColor;
    return [
      {
        start: [row, col],
        end: [row, col],
        type: formulaDependentHighlightType,
        depth: this.depth,
        inset: referenceHighlightInset,
        strokeWidth: 1,
        stroke: color,
        fill: this.#withOpacity(color, Math.max(config.referenceFillOpacity * 0.6, 0.04)),
        skipHit: true,
      },
    ];
  }

  #getConfig(): FormulaReferenceHighlightConfig {
    return (
      (this.#configEngine.getConfig<FormulaReferenceHighlightConfig>(
        formulaHighlightViewKey,
      ) as FormulaReferenceHighlightConfig) ?? formulaReferenceHighlightConfig
    );
  }

  #resolveDependencyBounds(
    dependency: Dependency,
    shape: { rowCount: number; colCount: number },
  ): { start: [number, number]; end: [number, number] } | null {
    if (dependency.kind === FormulaNodeKind.Cell) {
      return {
        start: [dependency.row, dependency.col],
        end: [dependency.row, dependency.col],
      };
    }
    if (dependency.kind === FormulaNodeKind.Range) {
      return { start: dependency.start, end: dependency.end };
    }
    if (dependency.kind === FormulaNodeKind.WorkbookCell || dependency.kind === FormulaNodeKind.WorkbookRange) {
      return null;
    }
    if (dependency.kind === FormulaNodeKind.ColumnRange) {
      if (shape.rowCount <= 0 || shape.colCount <= 0) return null;
      return {
        start: [0, dependency.startCol],
        end: [shape.rowCount - 1, dependency.endCol],
      };
    }
    if (shape.rowCount <= 0 || shape.colCount <= 0) return null;
    return {
      start: [dependency.startRow, 0],
      end: [dependency.endRow, shape.colCount - 1],
    };
  }

  #isFormula(cell: CellMatrixElement | null): cell is CellMatrixElement & {
    type: typeof CellType.Formula;
    formula: string;
  } {
    return cell?.type === CellType.Formula && typeof cell.formula === 'string' && cell.formula.startsWith('=');
  }

  #isWithinShape(
    start: readonly [number, number],
    end: readonly [number, number],
    shape: { rowCount: number; colCount: number },
  ): boolean {
    return start[0] >= 0 && start[1] >= 0 && end[0] < shape.rowCount && end[1] < shape.colCount;
  }

  #withOpacity(color: HexColor, opacity: number): string {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
}
