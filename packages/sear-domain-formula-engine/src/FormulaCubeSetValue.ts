/** CUBE set identity with its display caption. */
export interface FormulaCubeSetValue {
  readonly kind: 'cube-set';
  readonly connection: string;
  readonly expression: string;
  readonly caption: string;
  readonly count?: number;
}
