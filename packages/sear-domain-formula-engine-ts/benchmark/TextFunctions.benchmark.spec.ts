/** @jest-environment node */

import { benchmarkFormula } from './benchmarkUtils';
import { textBenchmarkNames } from './textBenchmarkNames';

const cases: ReadonlyArray<readonly [string, string]> = [
  ['ARRAYTOTEXT', '=ARRAYTOTEXT({1,"A"},1)'], ['ASC', '=ASC("ＡＢＣ１２３")'],
  ['BAHTTEXT', '=BAHTTEXT(1234567.89)'], ['CHAR', '=CHAR(65)'], ['CLEAN', '=CLEAN("A")'],
  ['CODE', '=CODE("A")'], ['CONCAT', '=CONCAT("A",1,"B")'], ['CONCATENATE', '=CONCATENATE("A","B")'],
  ['DBCS', '=DBCS("ABC123")'], ['DETECTLANGUAGE', '=DETECTLANGUAGE("hello")'],
  ['DOLLAR', '=DOLLAR(1234.5,2)'], ['EXACT', '=EXACT("word","word")'], ['FIND', '=FIND("M","Profit Margin")'],
  ['FINDB', '=FINDB("B","A中B")'], ['FIXED', '=FIXED(1234.567,2)'], ['JIS', '=JIS("ABC")'],
  ['LEFT', '=LEFT("Spreadsheet",5)'], ['LEFTB', '=LEFTB("A中B",2)'], ['LEN', '=LEN("Spreadsheet")'],
  ['LENB', '=LENB("A中B")'], ['LOWER', '=LOWER("Spreadsheet")'], ['MID', '=MID("Spreadsheet",3,5)'],
  ['MIDB', '=MIDB("A中B",2,2)'], ['NUMBERVALUE', '=NUMBERVALUE("2.500,27",",",".")'],
  ['PHONETIC', '=PHONETIC("かな")'], ['PROPER', '=PROPER("this is a title")'],
  ['REGEXEXTRACT', '=REGEXEXTRACT("A12 B34","[0-9]+",1)'],
  ['REGEXREPLACE', '=REGEXREPLACE("A12 B34","[0-9]+","#")'], ['REGEXTEST', '=REGEXTEST("A12","[0-9]+")'],
  ['REPLACE', '=REPLACE("Spreadsheet",3,5,"X")'], ['REPLACEB', '=REPLACEB("A中B",2,2,"文")'],
  ['REPT', '=REPT("abc",100)'], ['RIGHT', '=RIGHT("Spreadsheet",5)'], ['RIGHTB', '=RIGHTB("A中B",3)'],
  ['SEARCH', '=SEARCH("sheet","Spreadsheet")'], ['SEARCHB', '=SEARCHB("b","A中B")'],
  ['SUBSTITUTE', '=SUBSTITUTE("a-b-c","-","/")'], ['T', '=T("text")'],
  ['TEXT', '=TEXT(1234.5,"#,##0.00")'], ['TEXTAFTER', '=TEXTAFTER("a-b-c","-",2)'],
  ['TEXTBEFORE', '=TEXTBEFORE("a-b-c","-",2)'], ['TEXTJOIN', '=TEXTJOIN(",",TRUE,"A","B","C")'],
  ['TEXTSPLIT', '=TEXTSPLIT("A,B;C,D",",",";")'], ['TRANSLATE', '=TRANSLATE("hello","en","zh-Hans")'],
  ['TRIM', '=TRIM("  a   b  ")'], ['UNICHAR', '=UNICHAR(9733)'], ['UNICODE', '=UNICODE("★")'],
  ['UPPER', '=UPPER("Spreadsheet")'], ['VALUE', '=VALUE("$1,234.50")'], ['VALUETOTEXT', '=VALUETOTEXT("A",1)'],
];

describe('text function performance coverage', () => {
  it('has one measured path for every documented text function', () => {
    expect(cases.map(([name]) => name).sort()).toEqual([...textBenchmarkNames].sort());
  });

  it.each(cases)('%s stays within the configured threshold', (_name, formula) => {
    benchmarkFormula(formula);
  });
});
