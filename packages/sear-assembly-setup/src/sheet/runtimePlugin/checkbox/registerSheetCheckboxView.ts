import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';

import { SheetCheckboxView } from '@searsuite/sear-render';

import { SheetRenderCoordinatorManager, type CellProperties } from '@searsuite/sear-render-registry';

import { type Container } from '@searsuite/sear-foundation-di';

import { CellTypeCatalog } from '@searsuite/sear-domain-cell';

import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';

import { CommitCellEditCommand, IsCellEditingQuery } from '@searsuite/sear-plugin-cell-editor';

import { CursorRegistry } from '@searsuite/sear-render-cursor';
/** Attaches the checkbox presentation to its existing business contribution. */
export function registerSheetCheckboxView(container: Container): void {
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
    queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol);
  container.resolve<ViewExtensionRegistry<unknown, CellProperties>>(ViewExtensionRegistry.symbol).register(
    new SheetCheckboxView({
      commands,
      cursor: container.resolve<CursorRegistry>(CursorRegistry.symbol),
      coordinator: container.resolve<SheetRenderCoordinatorManager>(SheetRenderCoordinatorManager.symbol),
      types: container.resolve<CellTypeCatalog>(CellTypeCatalog.symbol),
      beforeToggle: () => {
        if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, undefined)) {
          commands.run(CommitCellEditCommand, undefined);
          return !queries.run(IsCellEditingQuery, undefined);
        }
        return true;
      },
    }),
  );
}
