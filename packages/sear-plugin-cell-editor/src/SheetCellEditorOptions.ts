import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { DataEngine } from '@searsuite/sear-domain-state';
import type { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import type { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import type { Platform } from '@searsuite/sear-foundation-platform';
import type { SheetInteractionReducerRegistry } from '@searsuite/sear-assembly-plugin';
import type { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import type {
  CellCommitStrategyRegistry,
  ICellFormatLocaleProvider,
  SheetCellInputValidationRegistry,
  CellClipboardCodecRegistry,
} from '@searsuite/sear-domain-cell-types';
import type {
  IFormulaSourceProvider,
  IFormulaParser,
  IFormulaDateSystemProvider,
} from '@searsuite/sear-domain-formula-engine';
import type { RichDocNode } from '@searsuite/sear-domain-doc';
export interface CellDocumentFormatting {
  capture(document: readonly RichDocNode[]): Readonly<Record<string, unknown>>;
  apply(document: readonly RichDocNode[], format: Readonly<Record<string, unknown>>): Schema[];
}
export interface SheetCellEditorOptions {
  readonly data: DataEngine;
  readonly merges: SheetCellMergePlugin;
  readonly selection: SheetSelectionPlugin;
  readonly platform: Platform;
  readonly commitStrategies: CellCommitStrategyRegistry;
  readonly interactionReducers: SheetInteractionReducerRegistry;
  readonly queries: SheetQueryRegistry;
  readonly formulaSourceProvider: IFormulaSourceProvider;
  readonly formulaParser: IFormulaParser;
  readonly cellFormatLocaleProvider: ICellFormatLocaleProvider;
  readonly inputValidation: SheetCellInputValidationRegistry;
  readonly dateSystemProvider: IFormulaDateSystemProvider;
  readonly cellCodecs: CellClipboardCodecRegistry;
  readonly formatting: CellDocumentFormatting;
}
