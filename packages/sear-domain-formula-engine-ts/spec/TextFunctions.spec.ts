/** @jest-environment node */
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { CjkFormulaTextLocale, FunctionRegistry, SingleByteFormulaTextLocale } from '../src/functions';
import { formatFixed } from '@searsuite/sear-domain-format';
import { evaluateCategoryFormula } from './FormulaCategoryTestUtils';
import {
  type EvalContext,
  type FormulaLanguageService,
  type FormulaPhoneticReader,
  type FormulaTextLocale,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

function context(
  data: Record<string, FormulaValue> = {},
  textLocale?: FormulaTextLocale,
  services: { phoneticReader?: FormulaPhoneticReader; languageService?: FormulaLanguageService } = {},
): EvalContext {
  return {
    ...(textLocale === undefined ? {} : { textLocale }),
    ...services,
    isCellInBounds: (row, col) => row >= 0 && row < 20 && col >= 0 && col < 20,
    getSheetShape: () => [20, 20],
    getCellValue: (row, col) => data[`${row},${col}`] ?? 0,
    *iterateRange(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) yield data[`${row},${col}`] ?? 0;
      }
    },
    *iterateRangeCells(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const key = `${row},${col}`;
          yield { row, col, value: data[key] ?? 0, source: key in data ? ('value' as const) : ('empty' as const) };
        }
      }
    },
  };
}

function evaluate(
  formula: string,
  data?: Record<string, FormulaValue>,
  textLocale?: FormulaTextLocale,
  services?: { phoneticReader?: FormulaPhoneticReader; languageService?: FormulaLanguageService },
): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  return evaluator.evaluate(new FormulaParser().parse(formula), context(data, textLocale, services));
}

describe('text formula functions', () => {
  it('uses WPS UTF-16 boundaries in text slices and replacements', () => {
    expect(evaluate('=LEFT("😀a",1)')).toBe('\ud83d');
    expect(evaluate('=LEFT("A😀B",2)')).toBe('A\ud83d');
    expect(evaluate('=RIGHT("a😀",1)')).toBe('\ude00');
    expect(evaluate('=MID("a😀b",2,1)')).toBe('\ud83d');
    expect(evaluate('=REPLACE("a😀b",2,1,"X")')).toBe('aX\ude00b');
    expect(evaluate('=REPLACE("a😀b",3,1,"X")')).toBe('a\ud83dXb');
  });

  it('treats an empty TEXTAFTER or TEXTBEFORE delimiter as a text boundary', () => {
    expect(evaluate('=TEXTAFTER("abc","")')).toBe('abc');
    expect(evaluate('=TEXTBEFORE("abc","")')).toBe('');
    expect(evaluate('=TEXTAFTER("abc","",-1)')).toBe('');
    expect(evaluate('=TEXTBEFORE("abc","",-1)')).toBe('abc');
    expect(evaluate('=TEXTAFTER("a-b","-")')).toBe('b');
    expect(evaluate('=TEXTBEFORE("a-b","-")')).toBe('a');
  });

  it('keeps the original type of an unused or selected text delimiter fallback', () => {
    expect(evaluate('=TEXTAFTER("abc","x",1,0,0,7)')).toBe(7);
    expect(evaluate('=TEXTBEFORE("abc","x",1,0,0,7)')).toBe(7);
    expect(evaluate('=ISNUMBER(TEXTAFTER("abc","x",1,0,0,7))')).toBe(true);
    expect(evaluate('=ISNUMBER(TEXTBEFORE("abc","x",1,0,0,7))')).toBe(true);
    expect(evaluate('=TEXTAFTER("a-b","-",1,0,0,1/0)')).toBe('b');
  });

  it('rejects malformed grouping and radix prefixes in VALUE', () => {
    for (const source of ['1,,2', '1,2,3', '12,34', '0x10', '0b11']) {
      expect(evaluate(`=VALUE("${source}")`)).toEqual({ kind: 'error', code: '#VALUE!' });
    }
    expect(evaluate('=VALUE("1,234.50")')).toBe(1234.5);
  });

  it('reports excessive FIXED and DOLLAR precision without disrupting later evaluations', () => {
    expect(evaluate('=FIXED(1,101)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=DOLLAR(1,101)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FIXED(0,100)')).toBe(`0.${'0'.repeat(100)}`);
    expect(evaluate('=1+1')).toBe(2);
  });

  it('leaves text unchanged when SUBSTITUTE receives an empty old text', () => {
    expect(evaluate('=SUBSTITUTE("aba","","x")')).toBe('aba');
    expect(evaluate('=LEN(SUBSTITUTE("aba","","x"))')).toBe(3);
  });

  it('propagates a directly referenced error from ARRAYTOTEXT', () => {
    expect(evaluate('=ARRAYTOTEXT(A1,1)', { '0,0': { kind: 'error', code: '#NAME?' } })).toEqual({
      kind: 'error',
      code: '#NAME?',
    });
  });

  it('preserves empty references as empty text arguments', () => {
    expect(evaluate('=CONCATENATE("A",A1,"B")')).toBe('AB');
    expect(evaluate('=CONCATENATE(A1,B1)')).toBe('');
    expect(evaluate('=TEXTJOIN(",",TRUE,A1,B1)')).toBeNull();
    expect(evaluate('=TEXTJOIN(", ",TRUE,A2:A8)')).toBeNull();
    expect(evaluate('=TEXTJOIN(A8:D8,TRUE,A2:D7)')).toBeNull();
    expect(evaluate('=TEXTJOIN(", ",TRUE,A1:A3)', { '1,0': 0 })).toBe('0');
    expect(evaluate('=REPLACEB(A1,2,2,"文")')).toBe('文');
    expect(evaluate('=REPLACEB(IF(TRUE,A1,0),2,2,"文")')).toBe('文');
    expect(evaluate('=LEN(A1)')).toBe(0);
    expect(evaluate('=REPLACEB(0,2,2,"文")')).toBe('0文');
  });

  it('BUG-336 counts each text range element', () => {
    expect(evaluateCategoryFormula('=LEN(D176:D177)', { '175,3': 'red', '176,3': 'blue' }))
      .toEqual([[3], [4]]);
    expect(evaluateCategoryFormula('=LEN(D176:D177)', { '176,3': 'blue' }, {
      iterateRangeCells: () => [
        { row: 175, col: 3, value: 0, source: 'empty' },
        { row: 176, col: 3, value: 'blue', source: 'value' },
      ],
    })).toEqual([[0], [4]]);
  });

  it('rejects REPLACEB byte counts beyond the spreadsheet text limit', () => {
    expect(evaluate('=REPLACEB("A中B",2,45000,"文")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=REPLACEB("A中B",2,32767,"文")')).toBe('A文');
  });

  it('converts blank references to zero in VALUE and NUMBERVALUE', () => {
    expect(evaluate('=VALUE(A1)')).toBe(0);
    expect(evaluate('=NUMBERVALUE(A1,",",".")')).toBe(0);
    expect(evaluate('=VALUE("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=NUMBERVALUE("")')).toBe(0);
    expect(evaluate('=NUMBERVALUE("",",",".")')).toBe(0);
    expect(evaluate('=NUMBERVALUE(",",".")')).toBe(0);
  });

  it('reads CODE values through a single code-page character', () => {
    expect(evaluate('=CODE("A")')).toBe(65);
    expect(evaluate('=CODE("汉字")')).toBe(15118729);
    expect(evaluate('=CODE("😀")')).toBe(0);
  });

  it.each([
    ['CHAR', '=CHAR(65)', 'A'],
    ['CLEAN', '=CLEAN(CHAR(9)&"Monthly report"&CHAR(10))', 'Monthly report'],
    ['CODE', '=CODE("!")', 33],
    ['CONCAT', '=CONCAT("A",1,"B")', 'A1B'],
    ['CONCATENATE', '=CONCATENATE("Hello"," ","World!")', 'Hello World!'],
    ['EXACT true', '=EXACT("word","word")', true],
    ['EXACT false', '=EXACT("Word","word")', false],
    ['FIND', '=FIND("e","Statements",6)', 7],
    ['LEFT', '=LEFT("Sweden",4)', 'Swed'],
    ['LEN', '=LEN("Excel")', 5],
    ['LOWER', '=LOWER("Apt. 2B")', 'apt. 2b'],
    ['MID', '=MID("Fluid Flow",7,20)', 'Flow'],
    ['PROPER', '=PROPER("this is a TITLE")', 'This Is A Title'],
    ['PROPER after digits', '=PROPER("76BudGet")', '76Budget'],
    ['REPLACE', '=REPLACE("Profit Margin",8,6,"Amount")', 'Profit Amount'],
    ['REPT', '=REPT("*-",3)', '*-*-*-'],
    ['RIGHT', '=RIGHT("Sweden",3)', 'den'],
    ['SEARCH', '=SEARCH("m?r*","Profit Margin")', 8],
    ['SUBSTITUTE all', '=SUBSTITUTE("Quarter 1, 2011","1","2")', 'Quarter 2, 2022'],
    ['SUBSTITUTE nth', '=SUBSTITUTE("a-b-c","-","/",2)', 'a-b/c'],
    ['T text', '=T("rainfall")', 'rainfall'],
    ['T number', '=T(19)', ''],
    ['TEXTAFTER', '=TEXTAFTER("Red riding hood"," ",2)', 'hood'],
    ['TEXTBEFORE', '=TEXTBEFORE("Red riding hood"," ",-1)', 'Red riding'],
    ['TEXTJOIN', '=TEXTJOIN(", ",TRUE,"A","","B")', 'A, B'],
    [
      'TEXTSPLIT',
      '=TEXTSPLIT("A,B;C,D",",",";")',
      [
        ['A', 'B'],
        ['C', 'D'],
      ],
    ],
    ['TRIM', '=TRIM("  First   Quarter  ")', 'First Quarter'],
    ['UNICHAR', '=UNICHAR(9733)', '★'],
    ['UNICODE', '=UNICODE("★")', 9733],
    ['UPPER', '=UPPER("total")', 'TOTAL'],
    ['VALUE currency', '=VALUE("$1,234.50")', 1234.5],
    ['VALUE percent', '=VALUE("35%")', 0.35],
    ['VALUE time', '=VALUE("16:48:00")', 0.7],
    ['VALUE date', '=VALUE("2024-02-29")', 45351],
  ] as const)('supports %s', (_name, formula, expected) => {
    expect(evaluate(formula)).toEqual(expected);
  });

  it('handles common boundaries and formula errors', () => {
    expect(evaluate('=LEFT("abc",0)')).toBe('');
    expect(evaluate('=MID("abc",10,2)')).toBe('');
    expect(evaluate('=MID("abc","2024-02-29",2)')).toBe('');
    expect(evaluate('=MIDB("abc","2024-02-29",2)')).toBe('');
    expect(evaluate('=RIGHT("abc",10)')).toBe('abc');
    expect(evaluate('=REPT("x",-1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FIND("z","abc")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXTAFTER("abc","z",1,0,0,"missing")')).toBe('missing');
    expect(evaluate('=TEXTAFTER("abc","z")')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TEXTBEFORE("abc","z")')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TEXTBEFORE("-",2)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TEXTAFTER("-",2)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TEXTAFTER("0","-",2)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXTBEFORE("a-b-c","-",-60)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXTAFTER("abc","-",2)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TEXTAFTER("a-b-c",FALSE,2)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXTBEFORE("a-b-c",FALSE,2)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXTAFTER("a-b-c","001",2)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TEXTSPLIT("",",",";")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXTSPLIT(";;",,";",TRUE)')).toEqual({ kind: 'error', code: '#CALC!' });
    expect(evaluate('=TEXTSPLIT(",,",",",,TRUE)')).toEqual({ kind: 'error', code: '#CALC!' });
    expect(evaluate('=TEXTSPLIT("a,b",",")')).toEqual([['a', 'b']]);
    expect(evaluate('=TEXTSPLIT(A1,",",";")', { '0,0': '' })).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=ARRAYTOTEXT(A1,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=ARRAYTOTEXT("",1)')).toBe('{""}');
    expect(evaluate('=ARRAYTOTEXT(-1e-12,1)')).toBe('{-0.000000000001}');
    expect(evaluate('=UNICHAR(1114112)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=UNICHAR("2024-02-29")')).toBe(String.fromCodePoint(45351));
    expect(evaluate('=CHAR("2024-02-29")')).toBe('�');
    expect(evaluate('=CHAR(45351)')).toBe('�');
    expect(evaluate('=CHAR(256)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CHAR(IF(TRUE,A1,0))', { '0,0': '2024-02-29' }, CjkFormulaTextLocale)).toBe('�');
    expect(evaluate('=LENB("😀")')).toBe(4);
    expect(evaluate('=LENB("A中")')).toBe(3);
    expect(evaluate('=VALUE("not a number")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('uses the host currency symbol for DOLLAR', () => {
    expect(evaluate('=DOLLAR(1234.5,2)', {}, { ...CjkFormulaTextLocale, currencySymbol: '￥' })).toBe('￥1,234.50');
    const locale = {
      ...CjkFormulaTextLocale,
      formatCurrency: (number: number, decimals: number) =>
        `￥${number < 0 ? '-' : ''}${formatFixed(Math.abs(number), decimals, false)}`,
    };
    expect(evaluate('=DOLLAR(-60,2)', {}, locale)).toBe('￥-60.00');
    expect(evaluate('=DOLLAR(1234.5,-2.675)', {}, locale)).toBe('￥1,000');
  });

  it('flattens ranges for CONCAT and TEXTJOIN', () => {
    const data = { '0,0': 'A', '0,1': 'B', '1,0': '', '1,1': 'C' };
    expect(evaluate('=CONCAT(A1:B2)', data)).toBe('AB C'.replace(' ', ''));
    expect(evaluate('=TEXTJOIN("-",TRUE,A1:B2)', data)).toBe('A-B-C');
  });

  it('handles repeated bulk text operations', () => {
    const input = 'Alpha 123 beta 456 '.repeat(1000);
    for (let index = 0; index < 10; index++) {
      expect(evaluate('=REGEXREPLACE(A1,"[0-9]+","#")', { '0,0': input })).toContain('Alpha #');
      expect(evaluate('=SUBSTITUTE(A1,"beta","BETA")', { '0,0': input })).toContain('BETA');
    }
  });

  it('formats values with shared Excel format codes', () => {
    expect(evaluate('=TEXT(1234.5,"#,##0.00")')).toBe('1,234.50');
    expect(evaluate('=TEXT(-1234.5,"#,##0.00;[Red](#,##0.00)")')).toBe('(1,234.50)');
    expect(evaluate('=TEXT(40944,"m/dd/yyyy")')).toBe('2/05/2012');
    expect(evaluate('=TEXT(12345,"0.00E+00")')).toBe('1.23E+04');
    expect(evaluate('=TEXT(1.25,"# ?/?")')).toBe('1 1/4');
    expect(evaluate('=TEXT("1.5","#,##0.00")')).toBe('1.50');
    expect(evaluate('=TEXT("2024-02-29","#,##0.00")')).toBe('45,351.00');
    expect(evaluate('=TEXT("a,b","#,##0.00")')).toBe('a,b');
    expect(evaluate('=TEXT("","#,##0.00")')).toBe('');
    expect(evaluate('=TEXT(1234.5,FALSE)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXT(1234.5,"FALSE")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate(`=TEXT(1,"0.${'0'.repeat(101)}")`)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TEXT(1E307,"0%")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('BUG-994 preserves literal digits in numeric TEXT format arguments', () => {
    expect(evaluate('=TEXT(1234.5,1.005)')).toBe('11234.505');
    expect(evaluate('=TEXT(1234.5,2.675)')).toBe('21235.675');
    expect(evaluate('=TEXT(1234.5,A1)', { '0,0': 1.005 })).toBe('11234.505');
    expect(evaluate('=TEXT(1234.5,IF(TRUE,A1,0))', { '0,0': 2.675 })).toBe('21235.675');
  });

  it('supports DOLLAR, FIXED, NUMBERVALUE, VALUETOTEXT, and ARRAYTOTEXT', () => {
    expect(evaluate('=DOLLAR(-1234.5,1)')).toBe('($1,234.5)');
    expect(evaluate('=DOLLAR("",2)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FIXED(1234.567,2,FALSE)')).toBe('1,234.57');
    expect(evaluate('=FIXED("",2)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FIXED("2024-02-29",2)')).toBe('45,351.00');
    expect(evaluate('=FIXED(1234.567,-45000)')).toBe('0');
    expect(evaluate('=NUMBERVALUE("1.234,5%",",",".")')).toBe(12.345);
    expect(evaluate('=VALUETOTEXT("hello",1)')).toBe('"hello"');
    expect(evaluate('=ARRAYTOTEXT(A1:B1,1)', { '0,0': 1, '0,1': 'x' })).toBe('{1,"x"}');
  });

  it('supports byte-oriented text functions with a DBCS text locale', () => {
    expect(evaluate('=LENB("A中B")', {}, CjkFormulaTextLocale)).toBe(4);
    expect(evaluate('=LEFTB("A中B",2)', {}, CjkFormulaTextLocale)).toBe('A ');
    expect(evaluate('=MIDB("A中B",2,2)', {}, CjkFormulaTextLocale)).toBe('中');
    expect(evaluate('=RIGHTB("A中B",3)', {}, CjkFormulaTextLocale)).toBe('中B');
    expect(evaluate('=FINDB("中","A中B")', {}, CjkFormulaTextLocale)).toBe(2);
    expect(evaluate('=SEARCHB("b","A中B")', {}, CjkFormulaTextLocale)).toBe(4);
    expect(evaluate('=REPLACEB("A中B",2,2,"文")', {}, CjkFormulaTextLocale)).toBe('A文B');
    expect(evaluate('=MIDB("A中B",2,1)', {}, CjkFormulaTextLocale)).toBe(' ');
    expect(evaluate('=REPLACEB("A中B",1,2,"文")', {}, CjkFormulaTextLocale)).toBe('文 B');
    expect(evaluate('=REPLACEB("A中B",2,1,"文")', {}, CjkFormulaTextLocale)).toBe('A文 B');
  });

  it('uses DBCS byte positions by default while allowing an explicit single-byte locale', () => {
    expect(evaluate('=LENB("A中B")')).toBe(4);
    expect(evaluate('=LEFTB("A中B",2)')).toBe('A ');
    expect(evaluate('=RIGHTB("A中B",2)')).toBe(' B');
    expect(evaluate('=LENB("A中B")', {}, SingleByteFormulaTextLocale)).toBe(3);
    expect(evaluate('=LEFTB("A中B",2)', {}, SingleByteFormulaTextLocale)).toBe('A中');
  });

  it('supports common ASC, DBCS, and JIS width conversions through the text locale', () => {
    expect(evaluate('=ASC("ＡＢＣ１２３ カ")')).toBe('ABC123 ｶ');
    expect(evaluate('=DBCS("ABC123 ｶ")')).toBe('ＡＢＣ１２３　カ');
    expect(evaluate('=ASC(-1e-12)')).toBe('-0.000000000001');
    expect(evaluate('=DBCS(1e-12)')).toBe('０．０００００００００００１');
    expect(evaluate('=CLEAN(1e-12)')).toBe('0.000000000001');
    expect(evaluate('=ASC("ＡＢＣ１２３ カ")', {}, CjkFormulaTextLocale)).toBe('ABC123 ｶ');
    expect(evaluate('=DBCS("ABC123 ｶ")', {}, CjkFormulaTextLocale)).toBe('ＡＢＣ１２３　カ');
    expect(evaluate('=JIS("ABC123 ｶ")', {}, CjkFormulaTextLocale)).toBe('ＡＢＣ１２３　カ');
  });

  it('formats baht text with Thai integer, satang, rounding, and negative rules', () => {
    expect(evaluate('=BAHTTEXT(1234)')).toBe('หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน');
    expect(evaluate('=BAHTTEXT(21.25)')).toBe('ยี่สิบเอ็ดบาทยี่สิบห้าสตางค์');
    expect(evaluate('=BAHTTEXT(0.5)')).toBe('ห้าสิบสตางค์');
    expect(evaluate('=BAHTTEXT(-0.5)')).toBe('ลบบาทห้าสิบสตางค์');
    expect(evaluate('=BAHTTEXT(-1e-12)')).toBe('ลบบาทถ้วน');
    expect(evaluate('=BAHTTEXT(-1.005)')).toBe('ลบหนึ่งบาทหนึ่งสตางค์');
    expect(evaluate('=BAHTTEXT(1000000000000000)')).toBe('หนึ่งพันล้านล้านบาทถ้วน');
    expect(evaluate('=BAHTTEXT("2024-02-29")')).toBe('สี่หมื่นห้าพันสามร้อยห้าสิบเอ็ดบาทถ้วน');
    expect(evaluate('=BAHTTEXT("")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('reads PHONETIC metadata from the referenced cell and range top-left cell', () => {
    const phoneticReader: FormulaPhoneticReader = {
      getCellPhonetic: (row, col) => (row === 0 && col === 0 ? 'とうきょう' : undefined),
    };
    expect(evaluate('=PHONETIC(A1)', { '0,0': '東京' }, undefined, { phoneticReader })).toBe('とうきょう');
    expect(evaluate('=PHONETIC(A1:B2)', { '0,0': '東京' }, undefined, { phoneticReader })).toBe('とうきょう');
    expect(evaluate('=PHONETIC("かな")')).toBe('かな');
    expect(evaluate('=PHONETIC(12)')).toBe('');
    expect(evaluate('=PHONETIC(A1)', { '0,0': { kind: 'error', code: '#DIV/0!' } })).toBe('');
    expect(evaluate('=PHONETIC(A1:B2)', { '0,0': { kind: 'error', code: '#DIV/0!' } })).toBe('');
    expect(evaluate('=PHONETIC(IF(TRUE,A1,0))', { '0,0': { kind: 'error', code: '#DIV/0!' } })).toBe('');
    expect(evaluate('=PHONETIC(IF(FALSE,A1,1/0))', { '0,0': { kind: 'error', code: '#DIV/0!' } }))
      .toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=PHONETIC(1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=PHONETIC(SQRT(-1))')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('NUMBERSTRING follows numeric mode and Chinese positional rules', () => {
    expect(evaluate('=NUMBERSTRING(0,1)')).toBe('○');
    expect(evaluate('=NUMBERSTRING(10,1)')).toBe('一十');
    expect(evaluate('=NUMBERSTRING(123,2)')).toBe('壹佰贰拾叁');
    expect(evaluate('=NUMBERSTRING(1.5,1)')).toBe('二');
    expect(evaluate('=NUMBERSTRING(1000000000000,1)')).toBe('一兆');
    expect(evaluate('=NUMBERSTRING(1000000000000000,1)')).toBe('一千兆');
    expect(evaluate('=NUMBERSTRING("2024-02-29",1)')).toBe('四万五千三百五十一');
    expect(evaluate('=NUMBERSTRING(-1,1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=NUMBERSTRING(123,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=NUMBERSTRING("",1)')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('uses a synchronous host cache for language detection and translation', () => {
    const languageService: FormulaLanguageService = {
      defaultTargetLanguage: 'zh-Hans',
      detectLanguage: (text) => (text === 'hello' ? { status: 'ready', value: 'en' } : { status: 'pending' }),
      translate: (text, source, target) =>
        text === 'hello' && source === 'en' && target === 'zh-Hans'
          ? { status: 'ready', value: '你好' }
          : { status: 'unavailable' },
    };
    expect(evaluate('=DETECTLANGUAGE("hello")', {}, undefined, { languageService })).toBe('en');
    expect(evaluate('=TRANSLATE("hello","en")', {}, undefined, { languageService })).toBe('你好');
    expect(evaluate('=DETECTLANGUAGE("pending")', {}, undefined, { languageService })).toEqual({
      kind: 'error',
      code: '#N/A',
    });
  });

  it('supports regex test, extract modes, replace occurrence, and invalid patterns', () => {
    expect(evaluate('=REGEXTEST("Alpha42","[a-z]+",1)')).toBe(true);
    expect(evaluate('=REGEXEXTRACT("A12 B34","[0-9]+")')).toBe('12');
    expect(evaluate('=REGEXEXTRACT("A12 B34","[0-9]+",1)')).toEqual([['12'], ['34']]);
    expect(evaluate('=REGEXEXTRACT("Jane Doe","([A-Za-z]+) ([A-Za-z]+)",2)')).toEqual([['Jane', 'Doe']]);
    expect(evaluate('=REGEXREPLACE("a1 b2 c3","[0-9]","X",2)')).toBe('a1 bX c3');
    expect(evaluate('=REGEXTEST("x","[")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });
});
