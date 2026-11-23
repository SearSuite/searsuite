import { SearError } from '@searsuite/sear-foundation-error';
import { type FormulaExternalServiceDefinition } from './FormulaExternalServiceDefinition';

/** Creates a stable external-service definition shared by hosts and plugins. */
export function defineFormulaExternalService<T>(
  id: string,
  options: Pick<FormulaExternalServiceDefinition<T>, 'subscribeInvalidation'> = {},
): FormulaExternalServiceDefinition<T> {
  if (id.trim().length === 0)
    throw new SearError('Formula external services require a non-empty id.', { serviceId: id });
  return Object.freeze({ id, ...options }) as FormulaExternalServiceDefinition<T>;
}
