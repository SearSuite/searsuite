/** Compact command keys persisted in matrix OT payloads. */
export enum MatrixOTActionName {
  RowInsert = 'ri',
  RowDelete = 'rd',
  RowMove = 'rm',
  ColInsert = 'ci',
  ColDelete = 'cd',
  ColMove = 'cm',
  UpdateCell = 'uc',
  ResizeRow = 'rr',
  ResizeCol = 'rc',
}
