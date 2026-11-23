import { Injectable } from '@searsuite/sear-foundation-di';
import { Inject } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { CellProperties } from '@searsuite/sear-render-registry';
import { assertSheetContributionWrite } from '@searsuite/sear-assembly-plugin';
import { CursorPosition, CursorRule, CursorRuleKind, CursorRulePriority, PositionCursorRule } from './CursorRule';
import { CursorToken } from './CursorToken';

/**
 * Stores cursor rules and resolves the correct CursorToken for a given CellProperties.
 *
 * Resolution priority (highest → lowest):
 *  1. Matching PositionCursorRule at the greatest layer — last registered wins
 *  2. PredicateCursorRule { priority: 'high' }          — last registered wins
 *  3. RegionCursorRule                                   — exact region match
 *  4. TypeCursorRule                                     — exact type match
 *  5. PredicateCursorRule { priority: 'low' }           — last registered wins
 *  6. Fallback: 'default'
 */
@Injectable()
export class CursorRegistry {
  /** DI token for resolving CursorRegistry. */
  public static readonly symbol: symbol = Symbol.for('CursorRegistry');

  readonly #regionRules = new Map<string | symbol, CursorRule>();
  readonly #typeRules = new Map<string | symbol, CursorRule>();
  readonly #highPreds = new Map<string | symbol | CursorRule, CursorRule>();
  readonly #lowPreds = new Map<string | symbol | CursorRule, CursorRule>();
  readonly #positionRules = new Map<string | symbol, CursorRule>();
  readonly #warnedPositionConflicts = new Set<string>();

  /** Creates a registry and optionally enables position-rule conflict diagnostics. */
  constructor(@Inject(Platform.symbol) private readonly platform?: Platform) {}

  /**
   * Registers a cursor rule and returns an idempotent disposer that restores
   * the previous rule for the same key when applicable.
   */
  register(rule: CursorRule): () => void {
    assertSheetContributionWrite(this);
    const entry = Object.freeze({ ...rule }) as CursorRule;
    if (rule.kind === CursorRuleKind.Region) {
      return this.replace(this.#regionRules, rule.region, entry);
    }
    if (rule.kind === CursorRuleKind.Type) {
      return this.replace(this.#typeRules, rule.cellType, entry);
    }
    if (rule.kind === CursorRuleKind.Position) {
      return this.replace(this.#positionRules, rule.key, entry);
    }
    const bucket = rule.priority === CursorRulePriority.High ? this.#highPreds : this.#lowPreds;
    return this.replace(bucket, rule.key ?? rule, entry);
  }

  /**
   * Registers a coordinate-aware cursor rule without requiring callers to
   * repeat the position-rule discriminator.
   * @param rule - Position rule fields excluding the fixed `kind` discriminator.
   * @returns An idempotent disposer that restores the previous rule for its key.
   */
  registerPosition(rule: Omit<PositionCursorRule, 'kind'>): () => void {
    return this.register({ ...rule, kind: CursorRuleKind.Position });
  }

  /**
   * Resolves a logical cursor token without exposing presentation details.
   * @param properties - Hit-tested cell properties, if any.
   * @param position - Pointer context used by registered coordinate rules.
   */
  resolve(properties: CellProperties | null, position?: CursorPosition): CursorToken {
    const positionToken = position ? this.resolvePosition(position) : null;
    if (positionToken) return positionToken;
    // 2. High-priority predicates (reverse order: last registered wins).
    for (const rule of [...this.#highPreds.values()].reverse()) {
      if (properties && rule.kind === CursorRuleKind.Predicate && rule.test(properties)) return rule.cursor;
    }
    // 3. Exact region match.
    if (properties?.region !== void 0) {
      const rule = this.#regionRules.get(properties.region);
      if (rule?.kind === CursorRuleKind.Region) return rule.cursor;
    }
    // 4. Exact type match.
    const byType = properties ? this.#typeRules.get(properties.type) : null;
    if (byType?.kind === CursorRuleKind.Type) return byType.cursor;
    // 5. Low-priority predicates (reverse order: last registered wins).
    for (const rule of [...this.#lowPreds.values()].reverse()) {
      if (properties && rule.kind === CursorRuleKind.Predicate && rule.test(properties)) return rule.cursor;
    }
    return CursorToken.Default;
  }

  private resolvePosition(position: CursorPosition): CursorToken | null {
    const matches = [...this.#positionRules.values()]
      .filter((rule): rule is Extract<CursorRule, { kind: typeof CursorRuleKind.Position }> => {
        return rule.kind === CursorRuleKind.Position && rule.test(position);
      })
      .sort((left, right) => left.layer - right.layer);
    const winner = matches.at(-1);
    if (!winner) return null;

    const conflicts = matches.filter((rule) => rule.layer === winner.layer);
    if (conflicts.length > 1) this.warnPositionConflict(conflicts);
    return winner.cursor;
  }

  private warnPositionConflict(rules: Extract<CursorRule, { kind: typeof CursorRuleKind.Position }>[]): void {
    const ids = rules.map((rule) => String(rule.key)).sort();
    const conflictId = `${rules[0].layer}:${ids.join(',')}`;
    if (this.#warnedPositionConflicts.has(conflictId)) return;
    this.#warnedPositionConflicts.add(conflictId);
    this.platform?.warn(
      `CursorRegistry position-rule conflict at layer ${rules[0].layer}: ${ids.join(
        ', ',
      )} all matched; the last registered rule wins.`,
    );
  }

  private replace<Key>(registry: Map<Key, CursorRule>, key: Key, rule: CursorRule): () => void {
    const previous = registry.get(key);
    registry.set(key, rule);
    const owner = this;
    return function unregisterCursorRule(): void {
      assertSheetContributionWrite(owner);
      if (registry.get(key) !== rule) return;
      if (previous) registry.set(key, previous);
      else registry.delete(key);
    };
  }
}
