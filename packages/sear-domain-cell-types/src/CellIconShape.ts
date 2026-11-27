export const CellVisualIconShape = {
  Up: 'up',
  Right: 'right',
  Down: 'down',
  Circle: 'circle',
  Diamond: 'diamond',
  Triangle: 'triangle',
  Flag: 'flag',
  Star: 'star',
  Bar: 'bar',
  Check: 'check',
  Cross: 'cross',
} as const;
export type CellVisualIconShape = (typeof CellVisualIconShape)[keyof typeof CellVisualIconShape];
