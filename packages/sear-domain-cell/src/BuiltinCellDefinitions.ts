import { CellTypeDefinition } from './CellTypeDefinition';
import { CellTypeCatalog } from './CellTypeCatalog';

import { EmptyCellTypeDefinition } from './EmptyCellTypeDefinition';
import { FormulaCellTypeDefinition } from './FormulaCellTypeDefinition';
import { NumberCellTypeDefinition } from './NumberCellTypeDefinition';
import { BooleanCellTypeDefinition } from './BooleanCellTypeDefinition';
import { RichTextCellTypeDefinition } from './RichTextCellTypeDefinition';
import { StringCellTypeDefinition } from './StringCellTypeDefinition';

/** Creates all built-in persisted cell definitions. */
export function createBuiltinCellDefinitions(): readonly CellTypeDefinition[] {
  return [
    new EmptyCellTypeDefinition(),
    new StringCellTypeDefinition(),
    new NumberCellTypeDefinition(),
    new BooleanCellTypeDefinition(),
    new RichTextCellTypeDefinition(),
    new FormulaCellTypeDefinition(),
  ];
}

/** Registers built-in cell definitions and returns a disposer in reverse order. */
export function registerBuiltinCellDefinitions(catalog: CellTypeCatalog): () => void {
  const disposers = createBuiltinCellDefinitions().map((definition) => catalog.register(definition));
  return (): void => [...disposers].reverse().forEach((dispose) => dispose());
}

export { EmptyCellTypeDefinition } from './EmptyCellTypeDefinition';
export { FormulaCellTypeDefinition } from './FormulaCellTypeDefinition';
export { NumberCellTypeDefinition } from './NumberCellTypeDefinition';
export { BooleanCellTypeDefinition } from './BooleanCellTypeDefinition';
export { RichTextCellTypeDefinition } from './RichTextCellTypeDefinition';
export { StringCellTypeDefinition } from './StringCellTypeDefinition';
