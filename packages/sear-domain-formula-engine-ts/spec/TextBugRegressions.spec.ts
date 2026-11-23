/** @jest-environment node */
import { FormulaErrorCode, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { evaluateCategoryFormula } from './FormulaCategoryTestUtils';

const error = (code: FormulaErrorCode): FormulaValue => ({ kind: 'error', code });
type Case = readonly [string, string, FormulaValue, Readonly<Record<string, FormulaValue>>?];

const cases: Case[] = [
  ['BUG-179', '=TEXTAFTER("abc","x",100)', error('#N/A')],
  ['BUG-180', '=SEARCH("~a","~abc")', 1],
  ['BUG-221', '=LEN(TEXTJOIN("",TRUE,REPT("X",20000),REPT("Y",20000)))', error('#VALUE!')],
  ['BUG-228', '=TEXTJOIN(",",TRUE)', error('#VALUE!')],
  ['BUG-235', '=TEXT(0.25,"[h]:mm")', '6:00'],
  ['BUG-236', '=NUMBERVALUE("1.2,3",".",",")', error('#VALUE!')],
  ['BUG-237', '=NUMBERVALUE("1..2","..",",")', error('#VALUE!')],
  ['BUG-252', '=REPT("x")', error('#VALUE!')],
  ['BUG-267', '=REGEXEXTRACT("abc","[0-9]+")', error('#N/A')],
  ['BUG-268', '=REGEXMATCH("ab","(?<=a)b")', error('#VALUE!')],
  ['BUG-306', '=TEXTJOIN("-",,1,2)', error('#VALUE!')],
  ['BUG-308', '=REGEXMATCH(LOWER("A"),"A",1)', error('#VALUE!')],
  ['BUG-309', '=REGEXMATCH(123,"[0-9]+")', error('#VALUE!')],
  ['BUG-320', '=MID("abc",,2)', error('#VALUE!')],
  ['BUG-331', '=CONCATENATE(A1:A2)', error('#VALUE!'), { '0,0': 'red', '1,0': 'blue' }],
  ['BUG-332', '=LEN(CONCATENATE(REPT("x",8192),"x"))', error('#VALUE!')],
  ['BUG-333', `=LEN(CONCATENATE(${Array(256).fill('"x"').join(',')}))`, error('#VALUE!')],
  ['BUG-368', '=TEXTBEFORE(A1,B1,1,1)', 'İ', { '0,0': 'İAB', '0,1': 'A' }],
  ['BUG-514', '=VALUE("1,2,3")', error('#VALUE!')],
  ['BUG-635', '=PROPER(A1)', 'E\u0301clair', { '0,0': 'e\u0301clair' }],
  ['BUG-663', '=BAHTTEXT(1,2)', error('#VALUE!')],
  ['BUG-664', '=BAHTTEXT(-0.5)', 'ลบบาทห้าสิบสตางค์'],
  ['BUG-1044', '=BAHTTEXT(-1e-12)', 'ลบบาทถ้วน'],
  ['BUG-665', '=BAHTTEXT(1000001)', 'หนึ่งล้านเอ็ดบาทถ้วน'],
  ['BUG-671', '=CODE(CHAR(233))', 233],
  ['BUG-672', '=JIS("ｶﾞ")', 'ガ'],
  ['BUG-673', '=SEARCHB("X",A1)', 2, { '0,0': 'İx' }],
  ['BUG-674', '=FINDB("","ABC",4)', 4],
  ['BUG-679', '=NUMBERSTRING(123,)', '一百二十三'],
  ['BUG-680', '=SEARCHB("A*","ABC")', 1],
  ['BUG-693', '=FIND("x","😀x")', 2],
  ['BUG-695', '=VALUE("%")', error('#VALUE!')],
  ['BUG-700', '=SEARCH("A*B","A"&CHAR(10)&"B")', 1],
  ['BUG-712', '=SEARCH("SS",A1)', 1, { '0,0': 'ß' }],
  ['BUG-739', '=TEXTAFTER("a-b","-",1,0,0,1/0)', 'b'],
  ['BUG-747', '=TEXTBEFORE("a-b","-",1,0,0,1/0)', 'a'],
  ['BUG-132', '=INDEX(TEXTSPLIT("a,b;c",{",",";"}),1,3)', 'c'],
  ['BUG-133/default-pad', '=ISNA(INDEX(TEXTSPLIT("a,b;c",",",";"),2,2))', true],
  ['BUG-133/number-pad', '=ISNUMBER(INDEX(TEXTSPLIT("a,b;c",",",";",FALSE,0,7),2,2))', true],
  ['BUG-852', '=INDEX(TEXTSPLIT("A|B","|",,,2),1,2)', error('#VALUE!')],
  ['BUG-897', '=REGEXTEST("ab","(?>a)b")', true],
  ['BUG-898', '=UNICODE(LEFT("😀",1))', 55357],
  ['BUG-900', '=UNICODE(CHAR(128))', 196],
  ['BUG-902', '=SUBSTITUTE("ABC","","X")', 'ABC'],
];

describe('text formula bug regressions', () => {
  for (const [id, formula, expected, values] of cases) {
    it(id, () => expect(evaluateCategoryFormula(formula, values)).toEqual(expected));
  }

  it.each([
    ['TEXTBEFORE absent delimiter', '=TEXTBEFORE("abc","x",100)', error('#N/A')],
    ['SEARCH escaped wildcard', '=SEARCH("~*","a*b")', 2],
    ['CONCAT limit', '=LEN(CONCAT(REPT("x",20000),REPT("y",20000)))', error('#VALUE!')],
    ['CONCATENATE limit', '=LEN(CONCATENATE(REPT("x",20000),REPT("y",20000)))', error('#VALUE!')],
    ['ampersand limit', '=LEN(REPT("x",20000)&REPT("y",20000))', error('#VALUE!')],
    ['TEXT elapsed hours', '=TEXT(1.25,"[h]:mm")', '30:00'],
    ['NUMBERVALUE first group character', '=NUMBERVALUE("1a2",".","ab")', 12],
    ['REGEXEXTRACT match', '=REGEXEXTRACT("a1","[0-9]+")', '1'],
    ['REGEXMATCH text', '=REGEXMATCH("123","[0-9]+")', true],
    ['REPLACE missing start', '=REPLACE("abc",,1,"X")', error('#VALUE!')],
    ['REPLACEB missing start', '=REPLACEB("abc",,1,"X")', error('#VALUE!')],
    ['MIDB missing start', '=MIDB("abc",,2)', error('#VALUE!')],
    ['VALUETOTEXT extra argument', '=VALUETOTEXT(1,1,2)', error('#VALUE!')],
    ['ARRAYTOTEXT extra argument', '=ARRAYTOTEXT({1},1,2)', error('#VALUE!')],
    ['DBCS voiced kana', '=DBCS("ｶﾞ")', 'ガ'],
    ['ASC voiced kana', '=ASC("ガ")', 'ｶﾞ'],
    ['SEARCHB end position', '=SEARCHB("","ABC",4)', 4],
    ['SEARCHB question wildcard', '=SEARCHB("A?C","ABC")', 1],
    ['SEARCH code point position', '=SEARCH("x","😀x")', 2],
    ['SEARCH newline question', '=SEARCH("A?B","A"&CHAR(10)&"B")', 1],
    ['REGEXTEST atomic backtracking', '=REGEXTEST("abc","(?>a|ab)c")', false],
    ['TEXTSPLIT mixed delimiters', '=INDEX(TEXTSPLIT("a|b;c",{"|",";"}),1,2)', 'b'],
    ['TEXTSPLIT numeric pad value', '=INDEX(TEXTSPLIT("a,b;c",",",";",FALSE,0,7),2,2)', 7],
    ['MID WPS high surrogate', '=UNICODE(MID("a😀b",2,1))', 55357],
    ['RIGHT WPS low surrogate', '=UNICODE(RIGHT("😀",1))', 56832],
    ['CODE packs the first Han character as UTF-8', '=CODE("中")', 14989485],
    ['CODE returns zero for a four-byte character', '=CODE("😀")', 0],
  ] as const)('%s', (_name, formula, expected) => {
    expect(evaluateCategoryFormula(formula)).toEqual(expected);
  });
});
