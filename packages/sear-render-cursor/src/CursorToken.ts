/** Built-in logical cursor names, unbound to any rendering technology. */
export const CursorToken = {
  Default: 'default',
  Cell: 'cell',
  Text: 'text',
  RowSelect: 'row-select',
  ColumnSelect: 'col-select',
  RowResize: 'row-resize',
  ColumnResize: 'col-resize',
  Move: 'move',
  Grab: 'grab',
  Grabbing: 'grabbing',
  NotAllowed: 'not-allowed',
  Pointer: 'pointer',
  Copy: 'copy',
} as const;

/** Built-in tokens plus an extension point for third-party plugins. */
export type CursorToken = (typeof CursorToken)[keyof typeof CursorToken] | (string & {});
