import {
  type CellClipboardCodecDefinition,
  type CellFormatTransferCodec,
  type CellCommitStrategyDefinition,
} from '@searsuite/sear-domain-cell-types';
import { type CellDisplayTextProvider } from './CellDisplayTextRegistry';

/** A persisted spreadsheet cell type and all behaviours associated with it. */
export abstract class CellTypeDefinition {
  /** Persisted cell type identifier stored on sheet cell data. */
  abstract readonly type: string;

  /** Creates commit strategies associated with this cell type. */
  createCommitStrategies(): readonly CellCommitStrategyDefinition[] {
    return [];
  }

  /** Creates the display-text provider associated with this cell type. */
  createDisplayTextProvider(): CellDisplayTextProvider | undefined {
    return void 0;
  }

  /** Creates clipboard behavior owned by this persisted cell type. */
  createClipboardCodec(): CellClipboardCodecDefinition | undefined {
    return void 0;
  }

  /** Optional format-transfer behavior owned by this cell type. */
  createFormatTransferCodec(): CellFormatTransferCodec | undefined {
    return undefined;
  }

  /** Validates persisted data before it reaches a renderer-specific Cell. */
  isStoredValue(_cell: { value?: unknown; formula?: unknown }): boolean {
    return true;
  }
}
