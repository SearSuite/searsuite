import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { type CellMatrixElement } from '@searsuite/sear-domain-sheet';
import {
  type FormulaText,
  type FormulaValue,
  FormulaErrorCode,
  createFormulaError,
  isFormulaErrorCode,
} from '@searsuite/sear-domain-formula-engine';
import { Platform } from '@searsuite/sear-foundation-platform';
import { CellType, assertCellExtensionWrite } from '@searsuite/sear-domain-cell-types';

/** Defines how one persisted cell type enters the formula domain. */
export interface CellFormulaValueConverter {
  /** Persisted cell type identifier handled by this converter. */
  readonly cellType: string;
  /**
   * Converts one sheet matrix element into a formula-engine value.
   * @param cell - Persisted sheet cell to read without mutating sheet state.
   * @returns Formula value used by formula evaluation and dependency recalculation.
   */
  toFormulaValue(cell: CellMatrixElement): FormulaValue;
}

function textValue(value: unknown, numericCoercion: FormulaText['numericCoercion']): FormulaText {
  return {
    kind: 'text',
    value: typeof value === 'string' ? value : String(value ?? ''),
    numericCoercion,
  };
}

function convertEmptyCellToFormulaValue(): FormulaValue {
  return 0;
}

function convertStringCellToFormulaValue(cell: CellMatrixElement): FormulaValue {
  return textValue(cell.value, 'allow');
}

function convertRichTextCellToFormulaValue(cell: CellMatrixElement): FormulaValue {
  return textValue(extractRichText(cell.value), 'allow');
}

function convertNumericCellToFormulaValue(cell: CellMatrixElement): FormulaValue {
  const value = Number(cell.value);
  return Number.isNaN(value) ? createFormulaError(FormulaErrorCode.Value) : value;
}

function convertBooleanCellToFormulaValue(cell: CellMatrixElement): FormulaValue {
  return cell.value === true;
}

function convertPhoneCellToFormulaValue(cell: CellMatrixElement): FormulaValue {
  return textValue(cell.value, 'deny');
}

function extractRichText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(extractRichDocumentNodeText).join('\n');
}

function extractRichDocumentNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as { type?: unknown; text?: unknown; content?: unknown[] };
  if (typeof value.text === 'string') return value.text;
  return Array.isArray(value.content) ? value.content.map(extractRichDocumentNodeText).join('') : '';
}

function getFormulaErrorValue(value: unknown): FormulaValue | null {
  if (!value || typeof value !== 'object' || (value as { kind?: unknown }).kind !== 'error') return null;
  const code = (value as { code?: unknown }).code;
  return createFormulaError(isFormulaErrorCode(code) ? code : FormulaErrorCode.Value);
}

/**
 * Cell type → formula semantic value registry.
 *
 * Rendering and formula coercion intentionally use separate registries: a
 * custom cell type can define its calculation semantics without coupling to a
 * Canvas renderer.
 */
@Injectable()
export class CellFormulaValueConverterRegistry {
  readonly #platform: Platform;

  /** DI token for resolving CellFormulaValueConverterRegistry. */
  public static readonly symbol = Symbol.for('CellFormulaValueConverterRegistry');

  readonly #converters = new Map<string, CellFormulaValueConverter>();

  /**
   * Creates a registry with the built-in cell-to-formula semantics.
   * @param platform - Platform adapter used for diagnostics when unknown cell types fall back to text.
   */
  constructor(@Inject(Platform.symbol) platform: Platform) {
    this.#platform = platform;
    this.register({
      cellType: CellType.Empty,
      toFormulaValue: convertEmptyCellToFormulaValue,
    });
    this.register({
      cellType: CellType.String,
      toFormulaValue: convertStringCellToFormulaValue,
    });
    this.register({
      cellType: CellType.RichText,
      toFormulaValue: convertRichTextCellToFormulaValue,
    });
    this.register({
      cellType: CellType.Number,
      toFormulaValue: convertNumericCellToFormulaValue,
    });
    this.register({
      cellType: CellType.Boolean,
      toFormulaValue: convertBooleanCellToFormulaValue,
    });
    this.register({
      cellType: 'currency',
      toFormulaValue: convertNumericCellToFormulaValue,
    });
    this.register({
      cellType: 'percent',
      toFormulaValue: convertNumericCellToFormulaValue,
    });
    this.register({
      cellType: 'phone',
      toFormulaValue: convertPhoneCellToFormulaValue,
    });
  }

  /**
   * Registers or overrides formula semantics for one cell type.
   * @param converter - Converter owned by a built-in package or third-party plugin.
   * @returns Disposer that restores the previous converter only if this registration is still active.
   */
  register(converter: CellFormulaValueConverter): () => void {
    assertCellExtensionWrite(this);
    const entry = Object.freeze({
      cellType: converter.cellType,
      toFormulaValue: converter.toFormulaValue.bind(converter),
    });
    const previous = this.#converters.get(entry.cellType);
    this.#converters.set(entry.cellType, entry);
    const registry = this;
    return function unregisterCellFormulaValueConverter(): void {
      assertCellExtensionWrite(registry);
      if (registry.#converters.get(entry.cellType) !== entry) return;
      if (previous) registry.#converters.set(entry.cellType, previous);
      else registry.#converters.delete(entry.cellType);
    };
  }

  /**
   * Converts a persisted sheet cell into the formula value contract.
   * @param cell - Matrix cell to convert; the method never writes back to the sheet matrix.
   * @returns Formula value, including canonical propagated formula errors or `#VALUE!` for malformed error payloads.
   */
  toFormulaValue(cell: CellMatrixElement): FormulaValue {
    const formulaErrorValue = getFormulaErrorValue(cell.value);
    if (formulaErrorValue !== null) return formulaErrorValue;

    const converter = this.#converters.get(cell.type);
    if (converter) return converter.toFormulaValue(cell);

    this.#platform.warn(
      `[Formula] No value converter registered for cell type "${cell.type}". Falling back to coercible text.`,
    );
    return textValue(cell.value, 'allow');
  }
}
