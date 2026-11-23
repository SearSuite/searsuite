import { AffixCellRenderDefinition } from './AffixCellRenderDefinition';
import { CellRenderDefinition } from './CellRenderDefinition';
import { CellTypeCatalog } from './CellTypeCatalog';
import { EditorCellRenderDefinition } from './EditorCellRenderDefinition';
import { EmptyCellTypeDefinition } from './EmptyCellTypeDefinition';
import { FormulaCellTypeDefinition } from './FormulaCellTypeDefinition';
import { NumberCellTypeDefinition } from './NumberCellTypeDefinition';
import { BooleanCellTypeDefinition } from './BooleanCellTypeDefinition';
import { RichTextCellTypeDefinition } from './RichTextCellTypeDefinition';
import { StringCellTypeDefinition } from './StringCellTypeDefinition';

/** Creates all built-in persisted and render-only cell definitions. */
export function createBuiltinCellDefinitions(): readonly CellRenderDefinition[] {
  return [
    new EmptyCellTypeDefinition(),
    new StringCellTypeDefinition(),
    new NumberCellTypeDefinition(),
    new BooleanCellTypeDefinition(),
    new RichTextCellTypeDefinition(),
    new FormulaCellTypeDefinition(),
    new AffixCellRenderDefinition(),
    new EditorCellRenderDefinition(),
  ];
}

/** Registers built-in cell definitions and returns a disposer in reverse order. */
export function registerBuiltinCellDefinitions(catalog: CellTypeCatalog): () => void {
  const disposers = createBuiltinCellDefinitions().map((definition) => catalog.register(definition));
  return (): void => [...disposers].reverse().forEach((dispose) => dispose());
}

export { AffixCellRenderDefinition } from './AffixCellRenderDefinition';
export { EditorCellRenderDefinition } from './EditorCellRenderDefinition';
export { EmptyCellTypeDefinition } from './EmptyCellTypeDefinition';
export { FormulaCellTypeDefinition } from './FormulaCellTypeDefinition';
export { NumberCellTypeDefinition } from './NumberCellTypeDefinition';
export { BooleanCellTypeDefinition } from './BooleanCellTypeDefinition';
export { RichTextCellTypeDefinition } from './RichTextCellTypeDefinition';
export { StringCellTypeDefinition } from './StringCellTypeDefinition';
