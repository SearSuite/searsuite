import { type FormulaValue } from '@searsuite/sear-domain-formula-engine';

type ComparisonOperator = '=' | '<>' | '!=' | '<' | '>' | '<=' | '>=' | 'contains';
export type QueryPredicate =
  | { kind: 'comparison'; column: number; operator: ComparisonOperator; value: FormulaValue }
  | { kind: 'and'; left: QueryPredicate; right: QueryPredicate }
  | { kind: 'or'; left: QueryPredicate; right: QueryPredicate };
export interface QueryClauses {
  columns?: number[];
  where?: QueryPredicate;
  order?: { column: number; direction: 1 | -1 }[];
  limit?: number;
  offset?: number;
}

type Token = { kind: 'word' | 'number' | 'string' | 'symbol'; text: string };

export function parseQuery(query: string): QueryClauses | undefined {
  const tokens = tokenize(query);
  return tokens ? new QueryParser(tokens).parse() : undefined;
}

class QueryParser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): QueryClauses | undefined {
    const clauses: QueryClauses = {};
    if (this.takeWord('select')) {
      if (!this.takeSymbol('*')) {
        const columns = this.columnList();
        if (!columns) return undefined;
        clauses.columns = columns;
      }
    }
    if (this.takeWord('where')) {
      const where = this.orExpression();
      if (!where) return undefined;
      clauses.where = where;
    }
    if (this.takeWord('order')) {
      if (!this.takeWord('by')) return undefined;
      const order = this.orderList();
      if (!order) return undefined;
      clauses.order = order;
    }
    if (this.takeWord('limit')) {
      const limit = this.nonnegativeInteger();
      if (limit === undefined) return undefined;
      clauses.limit = limit;
    }
    if (this.takeWord('offset')) {
      const offset = this.nonnegativeInteger();
      if (offset === undefined) return undefined;
      clauses.offset = offset;
    }
    return this.position === this.tokens.length ? clauses : undefined;
  }

  private columnList(): number[] | undefined {
    const first = this.column();
    if (first === undefined) return undefined;
    const columns = [first];
    while (this.takeSymbol(',')) {
      const column = this.column();
      if (column === undefined) return undefined;
      columns.push(column);
    }
    return columns;
  }

  private orderList(): NonNullable<QueryClauses['order']> | undefined {
    const order: NonNullable<QueryClauses['order']> = [];
    do {
      const column = this.column();
      if (column === undefined) return undefined;
      const direction = this.takeWord('desc') ? -1 : (this.takeWord('asc'), 1);
      order.push({ column, direction });
    } while (this.takeSymbol(','));
    return order;
  }

  private orExpression(): QueryPredicate | undefined {
    let left = this.andExpression();
    if (!left) return undefined;
    while (this.takeWord('or')) {
      const right = this.andExpression();
      if (!right) return undefined;
      left = { kind: 'or', left, right };
    }
    return left;
  }

  private andExpression(): QueryPredicate | undefined {
    let left = this.predicate();
    if (!left) return undefined;
    while (this.takeWord('and')) {
      const right = this.predicate();
      if (!right) return undefined;
      left = { kind: 'and', left, right };
    }
    return left;
  }

  private predicate(): QueryPredicate | undefined {
    if (this.takeSymbol('(')) {
      const nested = this.orExpression();
      return nested && this.takeSymbol(')') ? nested : undefined;
    }
    const column = this.column();
    if (column === undefined) return undefined;
    const token = this.tokens[this.position];
    const operator = token?.kind === 'symbol' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(token.text)
      ? token.text as ComparisonOperator
      : token?.kind === 'word' && token.text.toLowerCase() === 'contains' ? 'contains' : undefined;
    if (!operator) return undefined;
    this.position++;
    const value = this.literal();
    return value === undefined ? undefined : { kind: 'comparison', column, operator, value };
  }

  private literal(): FormulaValue | undefined {
    const token = this.tokens[this.position];
    if (!token) return undefined;
    if (token.kind === 'string') {
      this.position++;
      return token.text;
    }
    if (token.kind === 'number') {
      const value = Number(token.text);
      if (!Number.isFinite(value)) return undefined;
      this.position++;
      return value;
    }
    if (token.kind === 'word' && /^(true|false)$/i.test(token.text)) {
      this.position++;
      return token.text.toLowerCase() === 'true';
    }
    return undefined;
  }

  private column(): number | undefined {
    const token = this.tokens[this.position];
    const match = token?.kind === 'word' ? /^Col([1-9]\d*)$/i.exec(token.text) : null;
    if (!match) return undefined;
    this.position++;
    return Number(match[1]) - 1;
  }

  private nonnegativeInteger(): number | undefined {
    const token = this.tokens[this.position];
    if (token?.kind !== 'number' || !/^\d+$/.test(token.text)) return undefined;
    const value = Number(token.text);
    if (!Number.isSafeInteger(value)) return undefined;
    this.position++;
    return value;
  }

  private takeWord(word: string): boolean {
    const token = this.tokens[this.position];
    if (token?.kind !== 'word' || token.text.toLowerCase() !== word) return false;
    this.position++;
    return true;
  }

  private takeSymbol(symbol: string): boolean {
    const token = this.tokens[this.position];
    if (token?.kind !== 'symbol' || token.text !== symbol) return false;
    this.position++;
    return true;
  }
}

function tokenize(query: string): Token[] | undefined {
  const tokens: Token[] = [];
  for (let index = 0; index < query.length;) {
    const char = query[index]!;
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      let value = '';
      let closed = false;
      index++;
      while (index < query.length) {
        const next = query[index]!;
        if (next === '\\' && index + 1 < query.length) {
          value += query[index + 1];
          index += 2;
        } else if (next === quote && query[index + 1] === quote) {
          value += quote;
          index += 2;
        } else if (next === quote) {
          index++;
          closed = true;
          break;
        } else {
          value += next;
          index++;
        }
      }
      if (!closed) return undefined;
      tokens.push({ kind: 'string', text: value });
      continue;
    }
    const rest = query.slice(index);
    const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest)?.[0];
    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)?.[0];
    const symbol = /^(<=|>=|<>|!=|[=<>*,()])/.exec(rest)?.[0];
    if (word || number || symbol) {
      const text = word ?? number ?? symbol!;
      tokens.push({ kind: word ? 'word' : number ? 'number' : 'symbol', text });
      index += text.length;
    } else {
      return undefined;
    }
  }
  return tokens;
}
