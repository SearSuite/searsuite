import { Injectable } from '@searsuite/sear-foundation-di';
import { QueryRegistry } from './QueryRegistry';
export type { QueryHandler as SheetQueryHandler } from './QueryRegistry';

/** Sheet-local typed query registry with detached read results. */
@Injectable()
export class SheetQueryRegistry extends QueryRegistry {
  public static override readonly symbol: symbol = Symbol.for('SheetQueryRegistry');
}

/** Query execution counterpart to the Sheet command bus. */
export { SheetQueryRegistry as SheetQueryBus };
