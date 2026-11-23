import type { FormulaCellStatus, IFormulaStatusProvider, Dependency, CellKey } from '@searsuite/sear-domain-formula-engine';
import { FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import type { FormulaDependencyCellRef } from './FormulaStatusCommands';
import { toFormulaDependencyCellRefFromKey } from './FormulaDependencyReferences';

export function getTransitivePrecedents(provider: IFormulaStatusProvider, status: FormulaCellStatus, rootKey: CellKey, maxDepth: number): FormulaDependencyCellRef[] {
  const result = new Map<CellKey, FormulaDependencyCellRef>();
  const visited = new Set<CellKey>([rootKey]);
  let frontier = directCellDependencyKeys(status.dependencies);
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: CellKey[] = [];
    for (const key of frontier) {
      if (visited.has(key)) continue;
      visited.add(key);
      const ref = toFormulaDependencyCellRefFromKey(key);
      result.set(key, ref);
      next.push(...directCellDependencyKeys(provider.getFormulaCellStatus(ref.row, ref.col).dependencies));
    }
    frontier = next;
  }
  return [...result.values()];
}

export function getTransitiveDependents(provider: IFormulaStatusProvider, directDependents: readonly CellKey[], rootKey: CellKey, maxDepth: number): FormulaDependencyCellRef[] {
  const result = new Map<CellKey, FormulaDependencyCellRef>();
  const visited = new Set<CellKey>([rootKey]);
  let frontier = [...directDependents];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: CellKey[] = [];
    for (const key of frontier) {
      if (visited.has(key)) continue;
      visited.add(key);
      const ref = toFormulaDependencyCellRefFromKey(key);
      result.set(key, ref);
      next.push(...provider.getFormulaCellStatus(ref.row, ref.col).dependents);
    }
    frontier = next;
  }
  return [...result.values()];
}

function directCellDependencyKeys(dependencies: readonly Dependency[]): CellKey[] {
  return dependencies.flatMap((dependency) => dependency.kind === FormulaNodeKind.Cell ? [cellKey(dependency.row, dependency.col)] : []);
}
