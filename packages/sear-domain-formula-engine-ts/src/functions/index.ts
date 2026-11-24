/**
 * Function registry: TS implementation of IFunctionRegistry.
 *
 * Stores functions internally in Map<string, FormulaFunction>. Function names
 * are stored in uppercase, and lookups are case-insensitive.
 *
 * Automatically registers the built-in aggregate, conditional, and lookup functions.
 */

import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type FormulaFunction, IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { lockFormulaFunction } from '../lockFormulaFunction';
import { IF, IFERROR, logicalFunctions } from './conditional';
import { addInFunctions } from './addIn';
import { compatibilityFunctions } from './compatibility';
import { databaseFunctions } from './database';
import { informationFunctions } from './information';
import { cubeFunctions } from './cube';
import { dateTimeFunctions } from './dateTime';
import { financialFunctions } from './financial';
import { VLOOKUP } from './lookup';
import { ADDRESS } from './lookup/address';
import { AREAS } from './lookup/areas';
import { CHOOSE } from './lookup/choose';
import { CHOOSECOLS } from './lookup/choosecols';
import { CHOOSEROWS } from './lookup/chooserows';
import { COLUMN } from './lookup/column';
import { COLUMNS } from './lookup/columns';
import { DROP } from './lookup/drop';
import { EXPAND } from './lookup/expand';
import { FILTER } from './lookup/filter';
import { FORMULATEXT } from './lookup/formulatext';
import { ARRAY_CONSTRAIN } from './lookup/arrayConstrain';
import { FLATTEN } from './lookup/flatten';
import { GETPIVOTDATA } from './lookup/getpivotdata';
import { GROUPBY } from './lookup/groupby';
import { HLOOKUP } from './lookup/hlookup';
import { HSTACK } from './lookup/hstack';
import { HYPERLINK } from './lookup/hyperlink';
import { IMAGE } from './lookup/image';
import { INDEX } from './lookup/indexFunction';
import { INDIRECT } from './lookup/indirect';
import { LOOKUP } from './lookup/lookup';
import { MATCH } from './lookup/match';
import { OFFSET } from './lookup/offset';
import { PIVOTBY } from './lookup/pivotby';
import { ROW } from './lookup/row';
import { ROWS } from './lookup/rows';
import { RTD } from './lookup/rtd';
import { SORT } from './lookup/sort';
import { SORTBY } from './lookup/sortby';
import { TAKE } from './lookup/take';
import { TOCOL } from './lookup/tocol';
import { TOROW } from './lookup/torow';
import { TRANSPOSE } from './lookup/transpose';
import { TRIMRANGE } from './lookup/trimrange';
import { UNIQUE } from './lookup/unique';
import { VSTACK } from './lookup/vstack';
import { WRAPCOLS } from './lookup/wrapcols';
import { WRAPROWS } from './lookup/wraprows';
import { XLOOKUP } from './lookup/xlookup';
import { XMATCH } from './lookup/xmatch';
import { mathFunctions } from './math';
import { textFunctions } from './text';
import { webFunctions } from './web';
import { googleFunctions } from './google';

export * from './conditional';
export * from './compatibility';
export * from './database';
export * from './information';
export * from './addIn';
export * from './cube';
export * from './dateTime';
export * from './lookup';
export {
  ADDRESS,
  AREAS,
  ARRAY_CONSTRAIN,
  CHOOSE,
  CHOOSECOLS,
  CHOOSEROWS,
  COLUMN,
  COLUMNS,
  DROP,
  EXPAND,
  FILTER,
  FLATTEN,
  FORMULATEXT,
  GETPIVOTDATA,
  GROUPBY,
  HLOOKUP,
  HSTACK,
  HYPERLINK,
  IMAGE,
  INDEX,
  INDIRECT,
  LOOKUP,
  MATCH,
  OFFSET,
  PIVOTBY,
  ROW,
  ROWS,
  RTD,
  SORT,
  SORTBY,
  TAKE,
  TOCOL,
  TOROW,
  TRANSPOSE,
  TRIMRANGE,
  UNIQUE,
  VSTACK,
  WRAPCOLS,
  WRAPROWS,
  XLOOKUP,
  XMATCH,
} from './lookup';
export * from './text';
export * from './web';
export * from './google';
export { AGGREGATE, AVERAGE, COUNT, SUBTOTAL, SUM, SUMIF, SUMIFS } from './math/aggregation';
export {
  MDETERM,
  MINVERSE,
  MMULT,
  MUNIT,
  PERCENTOF,
  SEQUENCE,
  SERIESSUM,
  SUMPRODUCT,
  SUMSQ,
  SUMX2MY2,
  SUMX2PY2,
  SUMXMY2,
} from './math/array';
export {
  ABS,
  EXP,
  INT,
  LN,
  LOG,
  LOG10,
  MOD,
  PI,
  POWER,
  PRODUCT,
  QUOTIENT,
  SIGN,
  SQRT,
  SQRTPI,
  TRUNC,
} from './math/basic';
export { ARABIC, BASE, COMBIN, COMBINA, DECIMAL, GCD, LCM, MULTINOMIAL, ROMAN } from './math/combinatorics';
export { RAND, RANDARRAY, RANDBETWEEN } from './math/random';
export {
  CEILING_MATH,
  CEILING_PRECISE,
  EVEN,
  FACT,
  FACTDOUBLE,
  FLOOR_MATH,
  FLOOR_PRECISE,
  ISO_CEILING,
  MROUND,
  ODD,
  ROUND,
  ROUNDDOWN,
  ROUNDUP,
} from './math/rounding';
export {
  ACOS,
  ACOSH,
  ACOT,
  ACOTH,
  ASIN,
  ASINH,
  ATAN,
  ATAN2,
  ATANH,
  COS,
  COSH,
  COT,
  COTH,
  CSC,
  CSCH,
  DEGREES,
  RADIANS,
  SEC,
  SECH,
  SIN,
  SINH,
  TAN,
  TANH,
} from './math/trigonometry';
export * from './math/statistics';
export * from './financial';
import { builtInFunctionHelp } from '../generated/builtInFunctionHelp';

function getBuiltInFunctions(): readonly FormulaFunction[] {
  return [
    ...addInFunctions,
    IF,
    IFERROR,
    ...logicalFunctions,
    ...compatibilityFunctions,
    ...databaseFunctions,
    ...informationFunctions,
    ...cubeFunctions,
    VLOOKUP,
    ...lookupFunctions,
    ...dateTimeFunctions,
    ...mathFunctions,
    ...textFunctions,
    ...webFunctions,
    ...financialFunctions,
    ...googleFunctions,
  ];
}

/** FunctionRegistry public API. */
export interface FunctionRegistryOptions {
  /** Google-specific functions require an explicit host contribution when disabled. */
  readonly includeGoogleFunctions?: boolean;
  /** Built-ins omitted from the initial catalog; hosts may register them later. */
  readonly excludedBuiltinNames?: readonly string[];
}

@Injectable()
export class FunctionRegistry implements IFunctionRegistry {
  /** DI token for resolving FunctionRegistry. */
  public static readonly symbol = Symbol.for('FunctionRegistry');

  /** Uppercase function name -> function definition. */
  readonly #functions = new Map<string, Array<{ readonly token: symbol; readonly fn: FormulaFunction }>>();
  readonly #listeners = new Set<(functionNames: readonly string[]) => void>();
  readonly #batches = new Map<number, { entries: Array<{ key: string; token: symbol }>; changedNames: string[] }>();
  #nextRegistrationId = 0;
  #isCommandExecuting: (() => boolean) | undefined;
  #dispatchRemoval: ((id: number) => void) | undefined;

  enforceCommandBoundary(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void {
    if (this.#isCommandExecuting) throw new SearError('Formula function registry is already bound to an editor.');
    this.#isCommandExecuting = isCommandExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula functions must change through editor.commands.run(...).');
    }
  }

  /** Creates a FunctionRegistry instance. */
  constructor(options: FunctionRegistryOptions = {}) {
    const includeGoogleFunctions = options.includeGoogleFunctions ?? true;
    const excluded = new Set(options.excludedBuiltinNames?.map((name) => name.toUpperCase()));
    const builtInFunctions = getBuiltInFunctions();
    for (const fn of builtInFunctions) {
      const generated = builtInFunctionHelp[fn.name.toUpperCase()];
      if (!fn.descriptor) fn.descriptor = generated;
      else if (generated) {
        fn.descriptor = {
          ...generated,
          ...fn.descriptor,
          ...((fn.descriptor.minArguments ?? generated.minArguments) === undefined
            ? {}
            : { minArguments: fn.descriptor.minArguments ?? generated.minArguments }),
          ...((fn.descriptor.maxArguments ?? generated.maxArguments) === undefined
            ? {}
            : { maxArguments: fn.descriptor.maxArguments ?? generated.maxArguments }),
        };
      }
    }
    this.registerMany(
      builtInFunctions.filter(
        (fn) =>
          !excluded.has(fn.name.toUpperCase()) &&
          (includeGoogleFunctions || (!googleLookupFunctions.has(fn) && !googleFunctions.includes(fn))),
      ),
    );
  }

  /** Registers a formula function under its canonical and compatible names. */
  register(fn: FormulaFunction): () => void {
    return this.registerMany([fn]);
  }

  /** Registers multiple functions while publishing one combined invalidation. */
  registerMany(functions: readonly FormulaFunction[]): () => void {
    this.#assertCommandWrite();
    const batch = functions.map((fn) => {
      const key = fn.name.toUpperCase();
      const token = Symbol(key);
      const registrations = this.#functions.get(key) ?? [];
      registrations.push({ token, fn: lockFormulaFunction(fn) });
      this.#functions.set(key, registrations);
      return { key, token };
    });
    const changedNames = [...new Set(batch.map(({ key }) => key))];
    const id = this.#nextRegistrationId++;
    this.#batches.set(id, { entries: batch, changedNames });
    this.#emitChanged(changedNames);
    const registry = this;
    return function unregisterFormulaFunctions(): void {
      registry.unregisterRegistration(id);
    };
  }

  unregisterRegistration(id: number): void {
    if (!this.#batches.has(id)) return;
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      this.#dispatchRemoval!(id);
      return;
    }
    const batch = this.#batches.get(id)!;
    this.#batches.delete(id);
    const tokensByName = new Map<string, Set<symbol>>();
    batch.entries.forEach(({ key, token }) => {
        const tokens = tokensByName.get(key) ?? new Set<symbol>();
        tokens.add(token);
        tokensByName.set(key, tokens);
    });
    tokensByName.forEach((tokens, key) => {
        const current = this.#functions.get(key);
        if (!current) return;
        const remaining = current.filter((registration) => !tokens.has(registration.token));
        if (remaining.length > 0) this.#functions.set(key, remaining);
        else this.#functions.delete(key);
    });
    this.#emitChanged(batch.changedNames);
  }

  /** Returns the value. */
  get(name: string): FormulaFunction | undefined {
    return this.#functions.get(name.toUpperCase())?.at(-1)?.fn;
  }

  /** Returns whether the requested entry exists. */
  has(name: string): boolean {
    return this.#functions.has(name.toUpperCase());
  }

  /** Returns all registered entries. */
  list(): string[] {
    return [...this.#functions.keys()];
  }

  /** @inheritdoc */
  subscribe(listener: (functionNames: readonly string[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emitChanged(names: readonly string[]): void {
    if (names.length === 0) return;
    this.#listeners.forEach((listener) => listener(names));
  }
}

const googleLookupFunctions = new Set<FormulaFunction>([ARRAY_CONSTRAIN, FLATTEN]);

const lookupFunctions: readonly FormulaFunction[] = [
  ADDRESS,
  AREAS,
  ARRAY_CONSTRAIN,
  CHOOSE,
  CHOOSECOLS,
  CHOOSEROWS,
  COLUMN,
  COLUMNS,
  DROP,
  EXPAND,
  FILTER,
  FLATTEN,
  FORMULATEXT,
  GETPIVOTDATA,
  GROUPBY,
  HLOOKUP,
  HSTACK,
  HYPERLINK,
  IMAGE,
  INDEX,
  INDIRECT,
  LOOKUP,
  MATCH,
  OFFSET,
  PIVOTBY,
  ROW,
  ROWS,
  RTD,
  SORT,
  SORTBY,
  TAKE,
  TOCOL,
  TOROW,
  TRANSPOSE,
  TRIMRANGE,
  UNIQUE,
  VSTACK,
  WRAPCOLS,
  WRAPROWS,
  XLOOKUP,
  XMATCH,
];
