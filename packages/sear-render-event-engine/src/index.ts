/**
 * Hit testing and render-node event propagation.
 *
 * @packageDocumentation
 */

export { EventEngine, type EventWithOffset, type EventWithOffsetAndTarget } from './EventEngine';

export { EventRegistrar } from './EventRegistrar';
export { HeadlessEventRegistrar } from './HeadlessEventRegistrar';
export { normalizeEventKey, getViewHandlerName } from './EventNameUtils';
export { ViewExtensionRole, type ViewExtension } from './ViewExtension';
export { ViewExtensionRegistry } from './ViewExtensionRegistry';
export { ViewExtensionBase } from './ViewExtensionBase';
