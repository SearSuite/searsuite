import { type FormulaCubeMemberValue } from './FormulaCubeMemberValue';

/** Serializable member or tuple expression accepted by CUBE services. */
export type FormulaCubeMemberExpression = string | FormulaCubeMemberValue | readonly FormulaCubeMemberExpression[];
