import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import { type SheetI18nState } from './SheetI18nTypes';

/** Editor-local sheet i18n locale state. */
export const SheetI18nStateObservation = defineStateObservation<SheetI18nState>('sheet.i18n.state');
