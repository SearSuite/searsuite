/**
 * Idempotent subscription ownership and reverse-order disposal utilities.
 *
 * @packageDocumentation
 */

export {
  defineEventObservation,
  defineStateObservation,
  ObservationKind,
  type EventObservationDefinition,
  type ObservationDefinition,
  type ObservationSource,
  type StateObservationDefinition,
  type StateObservationSource,
} from './ObservationDefinition';
export { ObservationError, ObservationErrorCode } from './ObservationError';
export { ObservationRegistry } from './ObservationRegistry';
export { SubscriptionManager } from './SubscriptionManager';
