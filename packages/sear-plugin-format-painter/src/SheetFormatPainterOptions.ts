import { type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { type SheetFormatPainterSession } from './SheetFormatPainterSession';

/** Dependencies supplied by the owning composition root, with no global state. */
export interface SheetFormatPainterOptions {
  readonly formats: SheetFormatTransferRegistry;
  readonly readShape: () => readonly [number, number];
  readonly platform: Platform;
  readonly session?: SheetFormatPainterSession;
}
