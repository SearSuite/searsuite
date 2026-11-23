/** Query passed to a host-owned pivot data provider. */
export interface FormulaPivotDataQuery {
  readonly dataField: string;
  readonly pivotReference: string;
  readonly filters: readonly { field: string; item: string }[];
}
