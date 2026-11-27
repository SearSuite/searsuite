import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { type CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { CheckboxCellType, ToggleCheckboxesCommand } from '@searsuite/sear-plugin-checkbox';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { CursorRuleKind, CursorRulePriority, CursorToken, type CursorRegistry } from '@searsuite/sear-render-cursor';
import { ViewExtensionBase, type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import {
  defineCellRenderer,
  type CellProperties,
  type SheetRenderCoordinatorManager,
} from '@searsuite/sear-render-registry';
import { CheckboxCell } from './CheckboxCell';

/** View-only services for checkbox glyphs and pointer activation. */
export interface SheetCheckboxViewOptions {
  readonly commands: SheetCommandBus;
  readonly cursor: CursorRegistry;
  readonly coordinator: SheetRenderCoordinatorManager;
  readonly types: CellTypeCatalog;
  beforeToggle(): boolean;
}

/** Renders checkbox values and translates glyph hits into semantic commands. */
export class SheetCheckboxView extends ViewExtensionBase<unknown, CellProperties> {
  public override readonly depth = -25;
  readonly #options: SheetCheckboxViewOptions;
  readonly #disposers: Array<() => void> = [];

  public constructor(options: SheetCheckboxViewOptions) {
    super(new PluginKey('SheetCheckboxView'));
    this.#options = options;
    try {
      this.#disposers.push(
        options.cursor.register({
          kind: CursorRuleKind.Predicate,
          key: 'sheet.checkbox',
          priority: CursorRulePriority.High,
          test: (properties) => properties.semanticOwner === CheckboxCellType,
          cursor: CursorToken.Pointer,
        }),
      );
      this.#disposers.push(
        options.coordinator.registerStoredValueValidator(
          CheckboxCellType,
          (cell) => options.types.get(CheckboxCellType)?.isStoredValue(cell) ?? false,
        ),
      );
      this.#disposers.push(defineCellRenderer(CheckboxCellType, CheckboxCell).register(options.coordinator));
    } catch (error) {
      this.destroyView();
      throw error;
    }
  }

  public onMouseDown(_context: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    const properties = event.target?.properties;
    if (properties?.semanticOwner !== CheckboxCellType || (event.origin.button ?? 0) !== 0) return;
    const row = properties.startRowIndex;
    const column = properties.startColIndex;
    if (row === undefined || column === undefined) return false;
    event.origin.preventDefault();
    if (!this.#options.beforeToggle()) return false;
    const { commands } = this.#options;
    if (commands.has(SelectRangeCommand))
      commands.run(SelectRangeCommand, { anchor: [row, column], focus: [row, column] });
    commands.run(ToggleCheckboxesCommand, { anchor: [row, column], focus: [row, column] });
    return false;
  }

  public onDblClick(_context: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (event.target?.properties.semanticOwner === CheckboxCellType) return false;
  }

  public destroyView(): void {
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
  }
}
