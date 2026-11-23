import { type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';

/** Editor-local dependencies provided by the owning composition root. */
export interface SheetClearStyleOptions {
  readonly formats: SheetFormatTransferRegistry;
  readonly readShape: () => readonly [number, number];
}
