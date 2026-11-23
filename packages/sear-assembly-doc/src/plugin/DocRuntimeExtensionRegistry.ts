import {
  RuntimeCapabilityRegistry,
  defineRuntimeCapability,
  type RuntimeCapability,
  type RuntimeCapabilityReader,
} from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';

/** Typed token used to publish and consume document runtime capabilities. */
export type DocRuntimeCapability<T> = RuntimeCapability<T>;

/** Creates a typed document runtime capability token. */
export function defineDocRuntimeCapability<T>(id: string): DocRuntimeCapability<T> {
  return defineRuntimeCapability<T>(id);
}

/** Read-only view of editor-local document runtime capabilities exposed to hosts. */
export type DocRuntimeCapabilityReader = RuntimeCapabilityReader;

/** Registry of extension capabilities available to document plugins. */
@Injectable()
export class DocRuntimeExtensionRegistry extends RuntimeCapabilityRegistry {
  /** DI token for resolving the document runtime extension registry. */
  public static readonly symbol = Symbol.for('DocRuntimeExtensionRegistry');

  public constructor() {
    super('DocEditor');
  }
}
