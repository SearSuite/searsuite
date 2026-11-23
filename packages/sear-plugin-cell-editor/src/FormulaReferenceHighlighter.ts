import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { type FormulaAST, FormulaNodeKind, IFormulaParser } from '@searsuite/sear-domain-formula-engine';
import {
  formulaReferenceHighlightConfig,
  getFormulaReferenceColor,
  sheetFormulaPluginKey,
  type FormulaReferenceHighlightConfig,
} from '@searsuite/sear-plugin-formula';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { CellRangeHighlightKind, Highlighter, type HighlightContext, type Highlighting } from './Highlighter';

type FormulaReferenceNode = Extract<
  FormulaAST,
  {
    kind:
      | typeof FormulaNodeKind.Cell
      | typeof FormulaNodeKind.Range
      | typeof FormulaNodeKind.WorkbookCell
      | typeof FormulaNodeKind.WorkbookRange
      | typeof FormulaNodeKind.ColumnRange
      | typeof FormulaNodeKind.RowRange;
  }
>;
type ReferenceBounds =
  | { start: [number, number]; end: [number, number] }
  | {
      kind: typeof CellRangeHighlightKind.ColumnRange;
      startCol: number;
      endCol: number;
    }
  | {
      kind: typeof CellRangeHighlightKind.RowRange;
      startRow: number;
      endRow: number;
    };

/** Formula implementation of the editor's generic Highlighter contract. */
@Injectable()
export class FormulaReferenceHighlighter extends Highlighter {
  /** DI token for resolving FormulaReferenceHighlighter. */
  public static readonly symbol: symbol = Symbol.for('FormulaReferenceHighlighter');

  /** Creates a FormulaReferenceHighlighter instance. */
  constructor(
    @Inject(IFormulaParser.symbol) private readonly parser: IFormulaParser,
    @Inject(ConfigEngine.symbol) private readonly configEngine: ConfigEngine,
  ) {
    super();
  }

  /** @inheritdoc */
  public override highlight(formula: string, context?: HighlightContext): Highlighting {
    if (!formula.startsWith('=')) return { cellRanges: [], textAttributes: [] };

    const references = this.readReferenceNodes(formula);
    const candidates = this.findReferenceTokens(formula);
    const count = Math.min(references.length, candidates.length);
    const cellRanges: Highlighting['cellRanges'] = [];
    const textAttributes: Highlighting['textAttributes'] = [];

    for (let index = 0; index < count; index++) {
      const reference = references[index];
      const candidate = candidates[index];
      const color = this.getColor(index);
      const isCursorInside =
        context?.cursorOffset !== void 0 &&
        context.cursorOffset >= candidate.start &&
        context.cursorOffset <= candidate.end;
      const config = this.getConfig();
      const fillOpacity = isCursorInside ? config.activeReferenceFillOpacity : config.referenceFillOpacity;
      const bounds = this.getCurrentSheetBounds(reference);
      if (bounds) {
        cellRanges.push({
          ...bounds,
          color,
          fill: this.toTransparentColor(color, fillOpacity),
        });
      }
      textAttributes.push({
        start: candidate.start,
        end: candidate.end,
        attrs: { textStyle: { color } },
      });
    }
    return { cellRanges, textAttributes };
  }

  /** @inheritdoc */
  public override clear(): void {}

  private readReferenceNodes(formula: string): FormulaReferenceNode[] {
    try {
      const nodes: FormulaReferenceNode[] = [];
      this.collectReferenceNodes(this.parser.parse(formula), nodes);
      return nodes;
    } catch {
      // Incomplete expressions (such as "=D4+") still use parser kinds
      // for every independently valid reference token.
      return this.findReferenceTokens(formula).flatMap((token) => {
        try {
          const ast = this.parser.parse(`=${token.text}`);
          return this.isReferenceNode(ast) ? [ast] : [];
        } catch {
          return [];
        }
      });
    }
  }

  private collectReferenceNodes(node: FormulaAST, nodes: FormulaReferenceNode[]): void {
    switch (node.kind) {
      case FormulaNodeKind.Cell:
      case FormulaNodeKind.Range:
      case FormulaNodeKind.WorkbookCell:
      case FormulaNodeKind.WorkbookRange:
      case FormulaNodeKind.ColumnRange:
      case FormulaNodeKind.RowRange:
        nodes.push(node);
        return;
      case FormulaNodeKind.Call:
        node.args.forEach((arg) => this.collectReferenceNodes(arg, nodes));
        return;
      case FormulaNodeKind.Invoke:
        this.collectReferenceNodes(node.callee, nodes);
        node.args.forEach((arg) => this.collectReferenceNodes(arg, nodes));
        return;
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        this.collectReferenceNodes(node.left, nodes);
        this.collectReferenceNodes(node.right, nodes);
        return;
      case FormulaNodeKind.Unary:
        this.collectReferenceNodes(node.operand, nodes);
        return;
      case FormulaNodeKind.Tuple:
        node.items.forEach((item) => this.collectReferenceNodes(item, nodes));
    }
  }

  private findReferenceTokens(formula: string): Array<{ text: string; start: number; end: number }> {
    const tokens: Array<{ text: string; start: number; end: number }> = [];
    const reference =
      /'(?:[^']|'')+'!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|[A-Za-z_][A-Za-z0-9_$.]*!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+/g;
    let match: RegExpExecArray | null;
    while ((match = reference.exec(formula)) !== null) {
      if (!this.isInsideStringLiteral(formula, match.index)) {
        tokens.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
    return tokens;
  }

  private isInsideStringLiteral(formula: string, index: number): boolean {
    let quoted = false;
    for (let cursor = 0; cursor < index; cursor++) {
      if (formula[cursor] !== '"') continue;
      if (quoted && formula[cursor + 1] === '"') {
        cursor++;
        continue;
      }
      quoted = !quoted;
    }
    return quoted;
  }

  private getColor(referenceIndex: number): HexColor {
    return getFormulaReferenceColor(referenceIndex, this.getConfig().referenceColors) as HexColor;
  }

  private getCurrentSheetBounds(reference: FormulaReferenceNode): ReferenceBounds | null {
    switch (reference.kind) {
      case FormulaNodeKind.Cell:
        return {
          start: [reference.row, reference.col],
          end: [reference.row, reference.col],
        };
      case FormulaNodeKind.Range:
        return { start: reference.start, end: reference.end };
      case FormulaNodeKind.ColumnRange:
        return {
          kind: CellRangeHighlightKind.ColumnRange,
          startCol: reference.startCol,
          endCol: reference.endCol,
        };
      case FormulaNodeKind.RowRange:
        return {
          kind: CellRangeHighlightKind.RowRange,
          startRow: reference.startRow,
          endRow: reference.endRow,
        };
      case FormulaNodeKind.WorkbookCell:
      case FormulaNodeKind.WorkbookRange:
        return null;
    }
  }

  private isReferenceNode(node: FormulaAST): node is FormulaReferenceNode {
    return (
      node.kind === FormulaNodeKind.Cell ||
      node.kind === FormulaNodeKind.Range ||
      node.kind === FormulaNodeKind.WorkbookCell ||
      node.kind === FormulaNodeKind.WorkbookRange ||
      node.kind === FormulaNodeKind.ColumnRange ||
      node.kind === FormulaNodeKind.RowRange
    );
  }

  private toTransparentColor(color: HexColor, opacity: number): string {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  private getConfig(): FormulaReferenceHighlightConfig {
    const config = this.configEngine.getPluginConfig<FormulaReferenceHighlightConfig>(sheetFormulaPluginKey);
    return config ? (config as FormulaReferenceHighlightConfig) : formulaReferenceHighlightConfig;
  }
}
