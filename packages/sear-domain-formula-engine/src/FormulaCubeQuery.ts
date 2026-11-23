import { type FormulaCubeKpiProperty } from './FormulaCubeKpiProperty';
import { type FormulaCubeMemberExpression } from './FormulaCubeMemberExpression';
import { type FormulaCubeSetValue } from './FormulaCubeSetValue';

/** Serializable query handled by a host-owned CUBE service. */
export type FormulaCubeQuery =
  | {
      readonly kind: 'kpi-member';
      readonly connection: string;
      readonly kpiName: string;
      readonly property: FormulaCubeKpiProperty;
      readonly caption?: string;
    }
  | {
      readonly kind: 'member';
      readonly connection: string;
      readonly expression: FormulaCubeMemberExpression;
      readonly caption?: string;
    }
  | {
      readonly kind: 'member-property';
      readonly connection: string;
      readonly member: FormulaCubeMemberExpression;
      readonly property: string;
    }
  | {
      readonly kind: 'ranked-member';
      readonly connection: string;
      readonly set: string | FormulaCubeSetValue;
      readonly rank: number;
      readonly caption?: string;
    }
  | {
      readonly kind: 'set';
      readonly connection: string;
      readonly expression: string;
      readonly caption?: string;
      readonly sortOrder?: number;
      readonly sortBy?: string;
    }
  | { readonly kind: 'set-count'; readonly set: FormulaCubeSetValue }
  | { readonly kind: 'value'; readonly connection: string; readonly members: readonly FormulaCubeMemberExpression[] };
