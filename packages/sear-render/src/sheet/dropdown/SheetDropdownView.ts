import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { OpenDropdownPickerCommand, type SheetDropdownPlugin } from '@searsuite/sear-plugin-dropdown';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { type CoordinateEngine } from '@searsuite/sear-render-coord';
import { ViewExtensionBase, type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { CellVisualIconShape } from '@searsuite/sear-domain-cell-types';
import { type CellProperties, type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';

export interface SheetDropdownViewOptions {
  readonly source: Pick<SheetDropdownPlugin, 'readIndicator'>;
  readonly commands: SheetCommandBus;
  readonly coordinates: Pick<CoordinateEngine, 'screenToWorld'>;
  readonly registry: SheetCellVisualReaderRegistry;
  beforeOpen(): boolean;
}

/** Dropdown labels, arrow geometry, and pointer-to-command translation. */
export class SheetDropdownView extends ViewExtensionBase<unknown, CellProperties> {
  public override readonly depth = -24;
  readonly #options: SheetDropdownViewOptions;
  readonly #dispose: () => void;
  #ownsPointerRelease = false;

  public constructor(options: SheetDropdownViewOptions) {
    super(new PluginKey('SheetDropdownView'));
    this.#options = options;
    this.#dispose = options.registry.registerConditional({
      id: 'sheet.dropdown',
      properties: ['hideText'],
      read: ({ rowIndex, columnIndex }) => {
        const indicator = options.source.readIndicator(rowIndex, columnIndex);
        if (!indicator) return [];
        const layers = [];
        const hasLabels = indicator.labels.some((label) => label.color);
        if (hasLabels)
          layers.push({
            slot: 'dropdown.labels',
            x: 0,
            y: 0,
            width: indicator.showArrow ? 0.8 : 1,
            height: 1,
            labels: indicator.labels.map((label) => ({ text: label.text, fill: label.color ?? '#eef0f4' })),
          });
        if (indicator.showArrow)
          layers.push({
            slot: 'dropdown.arrow',
            x: 0.8,
            y: 0,
            width: 0.2,
            height: 1,
            icon: { shape: CellVisualIconShape.Down, color: '#64748b' },
          });
        return [
          { id: 'sheet.dropdown', priority: 0, ...(hasLabels ? { properties: { hideText: true } } : {}), layers },
        ];
      },
    });
  }

  public onMouseDown(_context: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    this.#ownsPointerRelease = false;
    const node = event.target;
    const row = node?.properties.startRowIndex;
    const column = node?.properties.startColIndex;
    if (!node || row === undefined || column === undefined || (event.origin.button ?? 0) !== 0) return;
    const worldX = this.#options.coordinates.screenToWorld(event.origin.offsetX, event.origin.offsetY).x;
    if (worldX < node.x + node.width * 0.8 || worldX > node.x + node.width) return;
    if (!this.#options.source.readIndicator(row, column)?.showArrow) return;
    if (!this.#options.beforeOpen()) return false;
    this.#ownsPointerRelease = true;
    const { commands } = this.#options;
    commands.run(SelectRangeCommand, { anchor: [row, column], focus: [row, column] });
    commands.run(OpenDropdownPickerCommand, { row, column });
    event.origin.preventDefault();
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
    this.#dispose();
  }
}
