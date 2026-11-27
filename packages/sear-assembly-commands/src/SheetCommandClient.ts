import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type SheetCommandBus } from './SheetCommandBus';
import { type SheetQueryRegistry } from './SheetQueryRegistry';
/** The command, query and subscription protocol of an independently owned Sheet. */
export interface SheetCommandClient {
  readonly commands: SheetCommandBus;
  readonly queries: SheetQueryRegistry;
  readonly observations: ObservationRegistry;
}
