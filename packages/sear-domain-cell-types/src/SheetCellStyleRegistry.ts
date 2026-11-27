import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { assertCellExtensionWrite } from './CellExtensionWriteBoundary';
import {
  type SheetCellStyle,
  type SheetCellStyleReader,
  type SheetCellStyleSource,
  type SheetCellStyleOverride,
  type SheetCellStyleMatch,
  type SheetCellStyleRuleSource,
} from './SheetCellStyle';

/** Composes semantic cell appearance before consumers choose a presentation. */
@Injectable()
export class SheetCellStyleRegistry implements SheetCellStyleReader {
  /** Dependency injection token for this editor-local implementation. */
  public static readonly symbol = Symbol.for('SheetCellStyleRegistry');
  readonly #sources = new Map<string, SheetCellStyleSource>();
  readonly #owners = new Map<keyof SheetCellStyle, string>();
  readonly #overrides = new Map<string, SheetCellStyleOverride>();
  readonly #rules = new Map<string, SheetCellStyleRuleSource>();
  #orderedOverrides: readonly SheetCellStyleOverride[] = [];

  /** Registers an editor-local contribution and returns its owned disposer. */
  public register(source: SheetCellStyleSource): () => void {
    this.#assertNew(source.id);
    for (const property of source.properties) {
      if (this.#owners.has(property)) throw new SearError(`Cell style property ${property} already has an owner.`);
    }
    const registered = this.#capture(source);
    this.#sources.set(source.id, registered);
    source.properties.forEach((property) => this.#owners.set(property, source.id));
    return () => {
      assertCellExtensionWrite(this);
      if (this.#sources.get(source.id) !== registered) return;
      this.#sources.delete(source.id);
      registered.properties.forEach((property) => this.#owners.delete(property));
    };
  }

  /** Adds an ordered semantic style override without replacing its base owner. */
  public registerOverride(source: SheetCellStyleOverride): () => void {
    this.#assertNew(source.id);
    this.#assertPriority(source.priority);
    for (const previous of this.#overrides.values()) {
      if (
        previous.priority === source.priority &&
        source.properties.some((property) => previous.properties.includes(property))
      ) {
        throw new SearError(`Cell style overrides at priority ${source.priority} must own different properties.`);
      }
    }
    const registered = Object.freeze({ ...this.#capture(source), priority: source.priority });
    this.#overrides.set(source.id, registered);
    this.#orderOverrides();
    return () => {
      assertCellExtensionWrite(this);
      if (this.#overrides.get(source.id) !== registered) return;
      this.#overrides.delete(source.id);
      this.#orderOverrides();
    };
  }

  /** Adds evaluated semantic style rules, ordered by priority and stable identity. */
  public registerConditional(source: SheetCellStyleRuleSource): () => void {
    this.#assertNew(source.id);
    const registered = Object.freeze({
      id: source.id,
      properties: Object.freeze([...source.properties]),
      read: source.read.bind(source),
    });
    this.#rules.set(source.id, registered);
    return () => {
      assertCellExtensionWrite(this);
      if (this.#rules.get(source.id) === registered) this.#rules.delete(source.id);
    };
  }

  /** Reads the composed semantic style for one cell without exposing drawing types. */
  public read(row: number, column: number): SheetCellStyle {
    const result: Record<string, unknown> = {};
    for (const source of this.#sources.values()) this.#merge(result, source, source.read(row, column));
    for (const source of this.#orderedOverrides) this.#merge(result, source, source.read(row, column));
    const matches: Array<{ source: SheetCellStyleRuleSource; match: SheetCellStyleMatch }> = [];
    for (const source of this.#rules.values()) {
      for (const match of source.read(row, column)) {
        this.#assertPriority(match.priority);
        matches.push({ source, match });
      }
    }
    matches.sort(
      (left, right) =>
        left.match.priority - right.match.priority ||
        compareId(left.source.id, right.source.id) ||
        compareId(left.match.id, right.match.id),
    );
    for (const { source, match } of matches) this.#merge(result, source, match.properties);
    return result;
  }

  /** Releases all contributions and derived caches owned by this registry. */
  public destroy(): void {
    assertCellExtensionWrite(this);
    this.#sources.clear();
    this.#owners.clear();
    this.#overrides.clear();
    this.#rules.clear();
    this.#orderedOverrides = [];
  }

  #capture(source: SheetCellStyleSource): SheetCellStyleSource {
    return Object.freeze({
      id: source.id,
      properties: Object.freeze([...source.properties]),
      read: source.read.bind(source),
    });
  }

  #assertNew(id: string): void {
    assertCellExtensionWrite(this);
    if (this.#sources.has(id) || this.#overrides.has(id) || this.#rules.has(id))
      throw new SearError(`Cell style source ${id} already exists.`);
  }

  #assertPriority(priority: number): void {
    if (!Number.isFinite(priority)) throw new SearError('Cell style rule priorities must be finite.');
  }

  #merge(
    result: Record<string, unknown>,
    source: Pick<SheetCellStyleSource, 'id' | 'properties'>,
    style: SheetCellStyle,
  ): void {
    for (const property of Object.keys(style) as Array<keyof SheetCellStyle>) {
      if (!source.properties.includes(property))
        throw new SearError(`Cell style source ${source.id} returned undeclared property ${property}.`);
      if (style[property] !== undefined) result[property] = style[property];
    }
  }

  #orderOverrides(): void {
    this.#orderedOverrides = [...this.#overrides.values()].sort((left, right) => left.priority - right.priority);
  }
}

function compareId(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
