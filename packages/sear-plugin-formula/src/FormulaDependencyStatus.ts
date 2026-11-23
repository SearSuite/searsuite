import { type FormulaCellStatus, type IFormulaStatusProvider } from '@searsuite/sear-domain-formula-engine';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import type {
  FormulaDependencyStatus,
  FormulaDependencyStatusCommandInput,
} from './FormulaStatusCommands';
import { toFormulaDependencyCellRef, toFormulaDependencyCellRefFromKey, toFormulaDependencyReference } from './FormulaDependencyReferences';
import { getTransitiveDependents, getTransitivePrecedents } from './FormulaDependencyTraversal';

export function createFormulaDependencyStatus(
  provider: IFormulaStatusProvider,
  status: FormulaCellStatus,
  input: FormulaDependencyStatusCommandInput,
): FormulaDependencyStatus {
  const maxDepth = normalizeMaxDepth(input.maxDepth);
  const key = cellKey(status.row, status.col);
  return {
    cell: toFormulaDependencyCellRef(status.row, status.col),
    status,
    precedents: status.dependencies.map(toFormulaDependencyReference),
    dependents: status.dependents.map(toFormulaDependencyCellRefFromKey),
    transitivePrecedents: input.includeTransitive === true ? getTransitivePrecedents(provider, status, key, maxDepth) : [],
    transitiveDependents: input.includeTransitive === true ? getTransitiveDependents(provider, status.dependents, key, maxDepth) : [],
  };
}

function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === void 0 || !Number.isFinite(maxDepth)) return 8;
  return Math.max(0, Math.floor(maxDepth));
}
