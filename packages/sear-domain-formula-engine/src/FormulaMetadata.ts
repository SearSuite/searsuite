import { type FormulaCellMetadata } from './FormulaCellMetadata';
import { type FormulaEnvironmentMetadata } from './FormulaEnvironmentMetadata';
import { type FormulaMetadataCellReference } from './FormulaMetadataCellReference';
import { type FormulaWorkbookMetadata } from './FormulaWorkbookMetadata';

/** Host-owned, synchronous metadata projection consumed during formula evaluation. */
export interface FormulaMetadataReader {
  readCell(reference: FormulaMetadataCellReference): FormulaCellMetadata | undefined;
  readWorkbook?(): FormulaWorkbookMetadata | undefined;
  readEnvironment?(): FormulaEnvironmentMetadata | undefined;
  readVisibleOrigin?(): FormulaMetadataCellReference | undefined;
}
