import { CellTypeDefinition, defineCellRenderer } from '@searsuite/sear-domain-cell';
import { CheckboxCellType, checkboxText } from './CheckboxCellValue';
import { CheckboxCellCommitStrategy } from './CheckboxCellCommitStrategy';
import { CheckboxCell } from './render/CheckboxCell';
/** Atomic catalog contribution for rendering, editing, display and clipboard behavior. */
export class CheckboxCellTypeDefinition extends CellTypeDefinition {
  /** Persisted feature identifier. */ public readonly type = CheckboxCellType;
  /** Binds rule-aware edit conversion to one editor. */ public constructor(
    private readonly hasRule?: (row: number, column: number) => boolean,
  ) {
    super();
  }
  /** Validates persisted booleans before creating a glyph. */ public override isStoredValue(cell: {
    value?: unknown;
  }): boolean {
    return typeof cell.value === 'boolean';
  }
  /** Creates the checkbox edit strategy. */ public override createCommitStrategies() {
    return [new CheckboxCellCommitStrategy(this.hasRule)];
  }
  /** Registers portable glyph rendering. */ public override createRenderer() {
    return defineCellRenderer(CheckboxCellType, CheckboxCell);
  }
  /** Provides stable boolean text for searches and measurements. */ public override createDisplayTextProvider() {
    return {
      cellType: CheckboxCellType,
      getDisplayText: (cell: { value?: unknown }) => (typeof cell.value === 'boolean' ? checkboxText(cell.value) : ''),
    };
  }
  /** Preserves checkbox identity on native copies; plain text remains TRUE/FALSE. */ public override createClipboardCodec() {
    return {
      cellType: CheckboxCellType,
      encode: (cell: { value?: unknown }) => ({ value: cell.value }),
      decode: (data: unknown) =>
        data && typeof data === 'object' && typeof (data as { value?: unknown }).value === 'boolean'
          ? { type: CheckboxCellType, value: (data as { value: boolean }).value }
          : null,
      toPlainText: (cell: { value?: unknown }) => (typeof cell.value === 'boolean' ? checkboxText(cell.value) : ''),
    };
  }
}
