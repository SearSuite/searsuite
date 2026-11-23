import { defineSheetCommand } from '@searsuite/sear-assembly-commands';
import { type SheetFormatRange } from '@searsuite/sear-assembly-plugin';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** Canonical activation modes shared by commands and hosts. */
export const FormatPainterMode = { Once: 'once', Persistent: 'persistent' } as const;
export type FormatPainterMode = (typeof FormatPainterMode)[keyof typeof FormatPainterMode];
export interface FormatPainterState {
  readonly mode: FormatPainterMode | null;
  readonly source: SheetFormatRange | null;
}
export interface StartFormatPainterInput {
  readonly source: SheetFormatRange;
  readonly mode?: FormatPainterMode;
}
export const StartFormatPainterCommand = defineSheetCommand<StartFormatPainterInput>('sheet.formatPainter.start');
export const ApplyFormatPainterCommand = defineSheetCommand<{ readonly destination: SheetFormatRange }>(
  'sheet.formatPainter.apply',
);
export const CancelFormatPainterCommand = defineSheetCommand('sheet.formatPainter.cancel');
export const FormatPainterObservation = defineStateObservation<FormatPainterState>('sheet.formatPainter');
