import { defineSheetCommand, defineSheetQuery } from '@searsuite/sear-assembly-commands';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** Command that updates local sheet view zoom; input is the next zoom scale. */
export const SetSheetZoomCommand = defineSheetCommand<number>('view.setZoom');

/** Reads the active editor's local view scale. */
export const ReadSheetZoomQuery = defineSheetQuery<void, number>('view.readZoom');

/** Publishes changes to the active editor's local view scale. */
export const SheetZoomObservation = defineStateObservation<number>('sheet.zoom');
