/** CUBE member or tuple identity with its display caption. */
export interface FormulaCubeMemberValue {
  readonly kind: 'cube-member';
  readonly connection: string;
  readonly expression: string;
  readonly caption: string;
}
