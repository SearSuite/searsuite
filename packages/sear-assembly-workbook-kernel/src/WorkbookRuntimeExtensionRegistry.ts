import {
  RuntimeCapabilityRegistry,
  defineRuntimeCapability,
  type RuntimeCapability,
  type RuntimeCapabilityReader,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type WorkbookCommandBus } from './WorkbookCommandBus';
import { type WorkbookPluginRuntime } from './WorkbookPluginContracts';

export type WorkbookRuntimeCapabilityToken<T> = RuntimeCapability<T>;
export type WorkbookRuntimeCapabilityReader = RuntimeCapabilityReader;

/** Creates a typed capability published by a Workbook plugin. */
export function defineWorkbookRuntimeCapability<T>(id: string): WorkbookRuntimeCapabilityToken<T> {
  return defineRuntimeCapability<T>(id);
}

/** Workbook capabilities registered by the default assembly root. */
export const WorkbookRuntimeCapability = {
  Platform: defineWorkbookRuntimeCapability<Platform>('workbook.runtime.platform'),
  Commands: defineWorkbookRuntimeCapability<WorkbookCommandBus>('workbook.runtime.commands'),
  Observations: defineWorkbookRuntimeCapability<ObservationRegistry>('workbook.runtime.observations'),
  Session: defineWorkbookRuntimeCapability<SessionStateRegistry>('workbook.runtime.session'),
  Formula: defineWorkbookRuntimeCapability<WorkbookPluginRuntime['formula']>('workbook.runtime.formula'),
  Runtime: defineWorkbookRuntimeCapability<WorkbookPluginRuntime>('workbook.runtime.host'),
} as const;

/** Editor-local capability registry exposed through WorkbookEditor.services. */
export class WorkbookRuntimeExtensionRegistry extends RuntimeCapabilityRegistry {
  public static readonly symbol = Symbol.for('WorkbookRuntimeExtensionRegistry');

  public constructor() {
    super('WorkbookEditor');
  }
}
