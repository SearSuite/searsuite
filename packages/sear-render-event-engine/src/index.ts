/**
 * Hit testing and render-node event propagation.
 *
 * @packageDocumentation
 */

export { EventEngine, type EventWithOffset, type EventWithOffsetAndTarget } from './EventEngine';

export { EventRegistrar } from './EventRegistrar';
export { HeadlessEventRegistrar } from './HeadlessEventRegistrar';
export { normalizeEventKey, getPluginHandlerName } from './EventNameUtils';
