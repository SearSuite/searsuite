import { type SheetCellStyle } from '@searsuite/sear-domain-cell-types';
import { CellHighlightStyle } from './CellHighlightRule';

export function resolveCellHighlightStyle(style: CellHighlightStyle): SheetCellStyle {
  switch (style) {
    case CellHighlightStyle.RedFill:
      return { fill: '#FBC8CF', textColor: '#BD101E' };
    case CellHighlightStyle.YellowFill:
      return { fill: '#FCE3A1', textColor: '#813D1A' };
    case CellHighlightStyle.GreenFill:
      return { fill: '#C9EDD1', textColor: '#25B059' };
    case CellHighlightStyle.RedBorder:
      return { stroke: '#BC0E1D' };
    case CellHighlightStyle.RedText:
      return { textColor: '#BE0E1E' };
  }
}
