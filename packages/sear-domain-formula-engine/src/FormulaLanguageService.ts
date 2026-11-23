import { type FormulaLanguageServiceResult } from './FormulaLanguageServiceResult';

/** Synchronous cache view for host-managed language services. */
export interface FormulaLanguageService {
  readonly defaultTargetLanguage?: string;
  detectLanguage(text: string): FormulaLanguageServiceResult;
  translate(text: string, sourceLanguage: string | undefined, targetLanguage: string): FormulaLanguageServiceResult;
  subscribeInvalidation?(listener: () => void): () => void;
}
