import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  SetNumericValidationControlValueCommand,
  type SheetDataValidationPlugin,
} from '@searsuite/sear-plugin-data-validation';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { type CoordinateEngine } from '@searsuite/sear-render-coord';
import { ViewExtensionBase, type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { CellVisualLayerShape } from '@searsuite/sear-render-node';
import { type CellProperties, type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { numericValidationControlLayers, numericValidationControlValueAt } from './NumericValidationControlView';

export interface SheetDataValidationViewOptions {
  readonly source: Pick<SheetDataValidationPlugin, 'readIssue' | 'readNumericControl' | 'validate'>;
  readonly registry: SheetCellVisualReaderRegistry;
  readonly commands: SheetCommandBus;
  readonly coordinates: Pick<CoordinateEngine, 'screenToWorld'>;
  beforeChange(): boolean;
}

/** Validation markers and numeric control interactions over semantic rule queries. */
export class SheetDataValidationView extends ViewExtensionBase<unknown, CellProperties> {
  public override readonly depth = -23;
  readonly #options: SheetDataValidationViewOptions;
  readonly #disposers: Array<() => void> = [];
  #ownsPointerRelease = false;

  public constructor(options: SheetDataValidationViewOptions) {
    super(new PluginKey('SheetDataValidationView'));
    this.#options = options;
    try {
      this.#disposers.push(
        options.registry.registerConditional({
          id: 'sheet.dataValidation.issue',
          properties: [],
          read: ({ rowIndex, columnIndex }) =>
            options.source.readIssue(rowIndex, columnIndex)
              ? [
                  {
                    id: 'sheet.dataValidation.issue',
                    priority: 0,
                    layers: [
                      {
                        slot: 'dataValidation.issue',
                        shape: CellVisualLayerShape.TopLeftTriangle,
                        x: 0,
                        y: 0,
                        width: 0.14,
                        height: 0.45,
                        fill: '#ff922b',
                      },
                    ],
                  },
                ]
              : [],
        }),
      );
      this.#disposers.push(
        options.registry.registerConditional({
          id: 'sheet.dataValidation.numericControl',
          properties: ['hideText'],
          read: ({ rowIndex, columnIndex }) => {
            const control = options.source.readNumericControl(rowIndex, columnIndex);
            return control
              ? [
                  {
                    id: 'sheet.dataValidation.numericControl',
                    priority: 0,
                    properties: { hideText: true },
                    layers: numericValidationControlLayers(control),
                  },
                ]
              : [];
          },
        }),
      );
    } catch (error) {
      this.destroyView();
      throw error;
    }
  }

  public onMouseDown(_context: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    this.#ownsPointerRelease = false;
    const node = event.target;
    const row = node?.properties.startRowIndex;
    const column = node?.properties.startColIndex;
    const { source, commands } = this.#options;
    if (
      !node ||
      row === undefined ||
      column === undefined ||
      (event.origin.button ?? 0) !== 0 ||
      !commands.has(SetNumericValidationControlValueCommand)
    )
      return;
    const control = source.readNumericControl(row, column);
    if (!control) return;
    const point = this.#options.coordinates.screenToWorld(event.origin.offsetX, event.origin.offsetY);
    const value = numericValidationControlValueAt(control, node, point.x, point.y);
    if (value === null) return;
    event.origin.preventDefault();
    if (!this.#options.beforeChange()) return false;
    if (source.validate(row, column, String(value)).reject) return false;
    this.#ownsPointerRelease = true;
    if (commands.has(SelectRangeCommand))
      commands.run(SelectRangeCommand, { anchor: [row, column], focus: [row, column] });
    commands.run(SetNumericValidationControlValueCommand, { row, column, value });
    return false;
  }

  public onMouseUp(_context: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (!this.#ownsPointerRelease) return;
    this.#ownsPointerRelease = false;
    event.origin.preventDefault();
    return false;
  }

  public destroyView(): void {
    this.#ownsPointerRelease = false;
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
  }
}
