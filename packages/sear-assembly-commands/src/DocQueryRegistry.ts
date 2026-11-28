import { Injectable } from '@searsuite/sear-foundation-di';
import { QueryRegistry } from './QueryRegistry';

/** Document-local typed query registry sharing the guarded read mechanism with Sheet. */
@Injectable()
export class DocQueryRegistry extends QueryRegistry {
  public static override readonly symbol: symbol = Symbol.for('DocQueryRegistry');
}
