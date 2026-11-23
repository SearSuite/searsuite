import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { ARRAYTOTEXT } from './arraytotext';
import { ASC } from './asc';
import { DBCS } from './dbcs';
import { FINDB } from './findb';
import { JIS } from './jis';
import { LEFTB } from './leftb';
import { LENB } from './lenb';
import { MIDB } from './midb';
import { REPLACEB } from './replaceb';
import { RIGHTB } from './rightb';
import { SEARCHB } from './searchb';
import { BAHTTEXT } from './bahtText';
import { CHAR } from './char';
import { CLEAN } from './clean';
import { CODE } from './code';
import { CONCAT } from './concat';
import { CONCATENATE } from './concatenate';
import { DOLLAR } from './dollar';
import { EXACT } from './exact';
import { FIND } from './find';
import { FIXED } from './fixed';
import { LEFT } from './left';
import { LEN } from './len';
import { LOWER } from './lower';
import { MID } from './mid';
import { NUMBERVALUE } from './numbervalue';
import { PROPER } from './proper';
import { REPLACE } from './replace';
import { REPT } from './rept';
import { RIGHT } from './right';
import { SEARCH } from './search';
import { SUBSTITUTE } from './substitute';
import { T } from './t';
import { TEXT } from './text';
import { TEXTAFTER } from './textAfter';
import { TEXTBEFORE } from './textBefore';
import { TEXTJOIN } from './textJoin';
import { TEXTSPLIT } from './textSplit';
import { TRIM } from './trim';
import { UNICHAR } from './unichar';
import { UNICODE } from './unicode';
import { UPPER } from './upper';
import { VALUE } from './value';
import { VALUETOTEXT } from './valuetotext';
import { DETECTLANGUAGE } from './detectLanguage';
import { TRANSLATE } from './translate';
import { PHONETIC } from './phonetic';
import { REGEXEXTRACT } from './regexExtract';
import { REGEXREPLACE } from './regexReplace';
import { REGEXTEST } from './regexTest';
import { REGEXMATCH } from './regexMatch';
import { NUMBERSTRING } from './numberString';

export { ARRAYTOTEXT } from './arraytotext';
export { ASC } from './asc';
export { DBCS } from './dbcs';
export { FINDB } from './findb';
export { JIS } from './jis';
export { LEFTB } from './leftb';
export { LENB } from './lenb';
export { MIDB } from './midb';
export { REPLACEB } from './replaceb';
export { RIGHTB } from './rightb';
export { SEARCHB } from './searchb';
export { BAHTTEXT, formatBahtText } from './bahtText';
export { CHAR } from './char';
export { CLEAN } from './clean';
export { CODE } from './code';
export { CONCAT } from './concat';
export { CONCATENATE } from './concatenate';
export { CjkFormulaTextLocale, SingleByteFormulaTextLocale, createFormulaTextLocale } from './dbcsTextLocale';
export { DOLLAR } from './dollar';
export { EXACT } from './exact';
export { FIND } from './find';
export { FIXED } from './fixed';
export { LEFT } from './left';
export { LEN } from './len';
export { LOWER } from './lower';
export { MID } from './mid';
export { NUMBERVALUE } from './numbervalue';
export { PROPER } from './proper';
export { REPLACE } from './replace';
export { REPT } from './rept';
export { RIGHT } from './right';
export { SEARCH } from './search';
export { SUBSTITUTE } from './substitute';
export { T } from './t';
export { TEXT } from './text';
export { TEXTAFTER } from './textAfter';
export { TEXTBEFORE } from './textBefore';
export { TEXTJOIN } from './textJoin';
export { TEXTSPLIT } from './textSplit';
export { TRIM } from './trim';
export { UNICHAR } from './unichar';
export { UNICODE } from './unicode';
export { UPPER } from './upper';
export { VALUE } from './value';
export { VALUETOTEXT } from './valuetotext';
export { DETECTLANGUAGE } from './detectLanguage';
export { TRANSLATE } from './translate';
export { PHONETIC } from './phonetic';
export { REGEXEXTRACT } from './regexExtract';
export { REGEXREPLACE } from './regexReplace';
export { REGEXTEST } from './regexTest';
export { REGEXMATCH } from './regexMatch';
export { NUMBERSTRING } from './numberString';

export const textFunctions: readonly FormulaFunction[] = [
  ARRAYTOTEXT,
  ASC,
  BAHTTEXT,
  CHAR,
  CLEAN,
  CODE,
  CONCAT,
  CONCATENATE,
  DBCS,
  DETECTLANGUAGE,
  DOLLAR,
  EXACT,
  FIND,
  FINDB,
  FIXED,
  JIS,
  LEFT,
  LEFTB,
  LEN,
  LENB,
  LOWER,
  MID,
  MIDB,
  NUMBERVALUE,
  NUMBERSTRING,
  PHONETIC,
  PROPER,
  REGEXEXTRACT,
  REGEXREPLACE,
  REGEXTEST,
  REGEXMATCH,
  REPLACE,
  REPLACEB,
  REPT,
  RIGHT,
  RIGHTB,
  SEARCH,
  SEARCHB,
  SUBSTITUTE,
  T,
  TEXT,
  TEXTAFTER,
  TEXTBEFORE,
  TEXTJOIN,
  TEXTSPLIT,
  TRANSLATE,
  TRIM,
  UNICHAR,
  UNICODE,
  UPPER,
  VALUE,
  VALUETOTEXT,
];
