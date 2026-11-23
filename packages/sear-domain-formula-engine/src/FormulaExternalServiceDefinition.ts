/** Typed identity for one synchronous service view consumed by formulas. */
export interface FormulaExternalServiceDefinition<T> {
  readonly id: string;
  readonly type?: T;
  readonly subscribeInvalidation?: (service: T, listener: () => void) => () => void;
}
