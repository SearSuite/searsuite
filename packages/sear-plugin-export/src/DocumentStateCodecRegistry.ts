import { ExportError } from './ExportError';
import { ExportErrorCode } from './ExportErrorCode';
import { type JsonValue, type SearDocumentStateModuleFile } from './ExportTypes';
import { cloneJsonValue } from './JsonPayload';

/** Codec contributed by the owner of one document-state module. */
export interface DocumentStateCodec<TState> {
  /** Stable module key written to persisted files. */
  readonly key: string;
  /** Serializes the module-owned part of a document state. */
  serialize(state: TState): unknown | undefined;
  /** Restores the module-owned part of a document state. */
  deserialize(payload: JsonValue, path: string): Partial<TState>;
}

/** Export contribution owned by one document-state owner. */
export interface DocumentStateModuleContribution<TOwnerState = unknown, TDocumentState extends object = object> {
  /** Stable module key written to persisted files. */
  readonly key: string;
  /** Captures this owner state into the aggregate document-state snapshot. */
  capture(ownerState: TOwnerState): Partial<TDocumentState> | undefined;
  /** JSON codec used for this module in stable export files. */
  readonly codec: DocumentStateCodec<TDocumentState>;
}

/** Registry that composes document-state modules without central field enumeration. */
export class DocumentStateCodecRegistry<TState> {
  readonly #codecs = new Map<string, DocumentStateCodec<TState>>();

  /** Registers a module codec. Duplicate keys are rejected. */
  public register(codec: DocumentStateCodec<TState>): this {
    if (this.#codecs.has(codec.key)) {
      throw new ExportError(ExportErrorCode.duplicateCodec, 'Document state export codec already exists.', {
        key: codec.key,
      });
    }
    this.#codecs.set(codec.key, codec);
    return this;
  }

  /** Registers the codec from a plugin-owned document-state contribution. */
  public registerContribution(contribution: DocumentStateModuleContribution<unknown, object>): this {
    if (contribution.codec.key !== contribution.key) {
      throw new ExportError(ExportErrorCode.invalidFormat, 'Document state export contribution key mismatch.', {
        key: contribution.key,
        codecKey: contribution.codec.key,
      });
    }
    return this.register(contribution.codec as unknown as DocumentStateCodec<TState>);
  }

  /** Serializes every registered module whose codec returns a payload. */
  public serialize(state: TState): SearDocumentStateModuleFile[] {
    return [...this.#codecs.values()].flatMap((codec) => {
      const payload = codec.serialize(state);
      if (payload === void 0) return [];
      return [{ key: codec.key, payload: cloneJsonValue(payload, codec.key) as JsonValue }];
    });
  }

  /** Deserializes registered modules into one partial document state. */
  public deserialize(modules: readonly SearDocumentStateModuleFile[], path: string): Partial<TState> {
    return modules.reduce<Partial<TState>>((state, module, index) => {
      const codec = this.#codecs.get(module.key);
      if (!codec) {
        throw new ExportError(ExportErrorCode.codecNotFound, 'Document state export codec is not registered.', {
          key: module.key,
          path: `${path}.modules[${index}]`,
        });
      }
      return { ...state, ...codec.deserialize(module.payload, `${path}.modules[${index}].payload`) };
    }, {});
  }
}
