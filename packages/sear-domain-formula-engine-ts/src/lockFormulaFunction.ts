import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

function cloneFrozenValue(value: FormulaValue): FormulaValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneFrozenValue(entry))) as unknown as FormulaValue;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entry]) => [key, cloneFrozenValue(entry as FormulaValue)]);
    return Object.freeze(Object.fromEntries(entries)) as FormulaValue;
  }
  return value;
}

/** Copies registration metadata once so reads never clone hot-path function definitions. */
export function lockFormulaFunction(fn: FormulaFunction): FormulaFunction {
  const descriptor = fn.descriptor && Object.freeze({
    ...fn.descriptor,
    parameters: Object.freeze(fn.descriptor.parameters.map((parameter) => Object.freeze({
      ...parameter,
      ...(parameter.accepts ? { accepts: Object.freeze([...parameter.accepts]) } : {}),
    }))),
    ...(fn.descriptor.externalServices
      ? { externalServices: Object.freeze([...fn.descriptor.externalServices]) }
      : {}),
  });
  const namedConstants = fn.namedConstants && Object.freeze(Object.fromEntries(
    Object.entries(fn.namedConstants).map(([name, value]) => [name, cloneFrozenValue(value)]),
  ));
  return Object.freeze({
    ...fn,
    ...(descriptor ? { descriptor } : {}),
    ...(namedConstants ? { namedConstants } : {}),
  });
}
