import { Injectable } from '@searsuite/sear-foundation-di';
import { assertCellExtensionWrite } from '@searsuite/sear-domain-cell-types';
import { type CellProperties } from './Cell';
import { SheetCellVisualReaderError, SheetCellVisualReaderErrorCode } from './SheetCellVisualReaderError';
import {
  type SheetCellVisualReadPosition,
  type SheetCellVisualReader,
  type SheetCellVisualOverride,
  type SheetCellConditionalVisualReader,
  type SheetCellVisualLayer,
} from './SheetCellVisualReader';

/** Composes editor-local, plugin-owned visual properties for Sheet cells. */
@Injectable()
export class SheetCellVisualReaderRegistry {
  /** DI token for the editor-local registry. */
  public static readonly symbol = Symbol.for('SheetCellVisualReaderRegistry');

  readonly #readers = new Map<string, SheetCellVisualReader>();
  readonly #propertyOwners = new Map<keyof CellProperties, string>();
  readonly #overrides = new Map<string, SheetCellVisualOverride>();
  readonly #conditionalReaders = new Map<string, SheetCellConditionalVisualReader>();
  #orderedOverrides: readonly SheetCellVisualOverride[] = [];

  /** Registers one reader and rejects duplicate ids or property ownership. */
  public register(reader: SheetCellVisualReader): () => void {
    assertCellExtensionWrite(this);
    this.assertUniqueId(reader.id);
    const registered: SheetCellVisualReader = Object.freeze({
      id: reader.id,
      properties: Object.freeze([...reader.properties]),
      read: reader.read.bind(reader),
    });

    for (const property of registered.properties) {
      const owner = this.#propertyOwners.get(property);
      if (owner !== undefined) {
        throw new SheetCellVisualReaderError(
          SheetCellVisualReaderErrorCode.PropertyConflict,
          `Sheet cell visual property "${String(property)}" is already owned by reader "${owner}".`,
          { property: String(property), existingReaderId: owner, readerId: registered.id },
        );
      }
    }

    this.#readers.set(registered.id, registered);
    registered.properties.forEach((property) => this.#propertyOwners.set(property, registered.id));

    let disposed = false;
    return () => {
      assertCellExtensionWrite(this);
      if (disposed || this.#readers.get(registered.id) !== registered) return;
      disposed = true;
      this.#readers.delete(registered.id);
      registered.properties.forEach((property) => {
        if (this.#propertyOwners.get(property) === registered.id) this.#propertyOwners.delete(property);
      });
    };
  }

  /** Registers explicit-priority overrides without acquiring base property ownership. */
  public registerOverride(reader: SheetCellVisualOverride): () => void {
    assertCellExtensionWrite(this);
    this.assertUniqueId(reader.id);
    if (!Number.isFinite(reader.priority)) {
      throw new SheetCellVisualReaderError(
        SheetCellVisualReaderErrorCode.InvalidPriority,
        `Sheet cell visual override "${reader.id}" must have a finite priority.`,
        { readerId: reader.id, priority: reader.priority },
      );
    }
    const registered: SheetCellVisualOverride = Object.freeze({
      id: reader.id,
      priority: reader.priority,
      properties: Object.freeze([...reader.properties]),
      read: reader.read.bind(reader),
    });
    for (const existing of this.#overrides.values()) {
      if (existing.priority !== registered.priority) continue;
      const property = registered.properties.find((property) => existing.properties.includes(property));
      if (property !== undefined) {
        throw new SheetCellVisualReaderError(
          SheetCellVisualReaderErrorCode.OverrideConflict,
          `Sheet cell visual overrides "${reader.id}" and "${existing.id}" share property "${String(
            property,
          )}" at priority ${reader.priority}.`,
          { readerId: registered.id, existingReaderId: existing.id, property: String(property), priority: registered.priority },
        );
      }
    }
    this.#overrides.set(registered.id, registered);
    this.orderOverrides();
    let disposed = false;
    return () => {
      assertCellExtensionWrite(this);
      if (disposed || this.#overrides.get(registered.id) !== registered) return;
      disposed = true;
      this.#overrides.delete(registered.id);
      this.orderOverrides();
    };
  }

  /** Registers a rule source whose matches are composed across feature plugins. */
  public registerConditional(reader: SheetCellConditionalVisualReader): () => void {
    assertCellExtensionWrite(this);
    this.assertUniqueId(reader.id);
    const registered: SheetCellConditionalVisualReader = Object.freeze({
      id: reader.id,
      properties: Object.freeze([...reader.properties]),
      ...(reader.readHighestPriority ? { readHighestPriority: reader.readHighestPriority.bind(reader) } : {}),
      read: reader.read.bind(reader),
    });
    this.#conditionalReaders.set(registered.id, registered);
    let disposed = false;
    return () => {
      assertCellExtensionWrite(this);
      if (disposed || this.#conditionalReaders.get(registered.id) !== registered) return;
      disposed = true;
      this.#conditionalReaders.delete(registered.id);
    };
  }

  /** Allocates an order after every registered conditional rule owner. */
  public nextConditionalPriority(): number {
    let highest = 0;
    for (const reader of this.#conditionalReaders.values()) {
      const priority = reader.readHighestPriority?.() ?? 0;
      if (!Number.isSafeInteger(priority) || priority < 0) {
        throw new SheetCellVisualReaderError(
          SheetCellVisualReaderErrorCode.InvalidPriority,
          `Sheet conditional visual reader "${reader.id}" returned an invalid rule priority.`,
          { readerId: reader.id, priority },
        );
      }
      if (priority > highest) highest = priority;
    }
    return highest + 1;
  }

  /** Reads and combines every registered visual contribution for one cell. */
  public read(position: SheetCellVisualReadPosition): Partial<CellProperties> {
    return this.readVisual(position).properties;
  }

  /** Composes base properties, matched rules and visual layers in one pass. */
  public readVisual(position: SheetCellVisualReadPosition): {
    properties: Partial<CellProperties>;
    layers: readonly SheetCellVisualLayer[];
  } {
    const result: Partial<CellProperties> = {};
    for (const reader of this.#readers.values()) {
      const contribution = reader.read(position);
      this.assertDeclaredProperties(reader, contribution);
      Object.assign(result, contribution);
    }
    for (const reader of this.#orderedOverrides) {
      const contribution = reader.read(position);
      this.assertDeclaredProperties(reader, contribution);
      for (const property of Reflect.ownKeys(contribution) as (keyof CellProperties)[]) {
        if (contribution[property] !== undefined) Object.assign(result, { [property]: contribution[property] });
      }
    }
    const matches = [...this.#conditionalReaders.values()].flatMap((reader) =>
      reader.read(position).map((match) => ({ reader, match })),
    ).sort((a, b) => a.match.priority - b.match.priority || compareIds(a.reader.id, b.reader.id) ||
      compareIds(a.match.id, b.match.id));
    const layers = new Map<string, SheetCellVisualLayer>();
    for (const { reader, match } of matches) {
      if (match.properties) {
        this.assertDeclaredProperties(reader, match.properties);
        for (const property of Reflect.ownKeys(match.properties) as (keyof CellProperties)[]) {
          if (match.properties[property] !== undefined) Object.assign(result, { [property]: match.properties[property] });
        }
      }
      for (const layer of match.layers ?? []) layers.set(layer.slot, layer);
    }
    return { properties: result, layers: [...layers.values()].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)) };
  }

  /** Removes all editor-local reader registrations. */
  public destroy(): void {
    assertCellExtensionWrite(this);
    this.#readers.clear();
    this.#propertyOwners.clear();
    this.#overrides.clear();
    this.#conditionalReaders.clear();
    this.#orderedOverrides = [];
  }

  private assertUniqueId(readerId: string): void {
    if (!this.#readers.has(readerId) && !this.#overrides.has(readerId) && !this.#conditionalReaders.has(readerId)) return;
    throw new SheetCellVisualReaderError(
      SheetCellVisualReaderErrorCode.DuplicateReader,
      `Sheet cell visual reader "${readerId}" is already registered.`,
      { readerId },
    );
  }

  private assertDeclaredProperties(
    reader: Pick<SheetCellVisualReader, 'id' | 'properties'>,
    contribution: Readonly<Partial<CellProperties>>,
  ): void {
    for (const property of Reflect.ownKeys(contribution) as (keyof CellProperties)[]) {
      if (reader.properties.includes(property)) continue;
      throw new SheetCellVisualReaderError(
        SheetCellVisualReaderErrorCode.UndeclaredProperty,
        `Sheet cell visual reader "${reader.id}" returned undeclared property "${String(property)}".`,
        { readerId: reader.id, property: String(property) },
      );
    }
  }

  private orderOverrides(): void {
    this.#orderedOverrides = [...this.#overrides.values()].sort((left, right) => left.priority - right.priority);
  }
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
