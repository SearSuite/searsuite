import { SheetDropdownView } from '@searsuite/sear-render';

import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';

import { CoordinateEngine } from '@searsuite/sear-render-coord';

import { SheetCellVisualReaderRegistry, type CellProperties } from '@searsuite/sear-render-registry';

import { type Container } from '@searsuite/sear-foundation-di';

import { SheetDropdownPlugin } from '@searsuite/sear-plugin-dropdown';

import { SheetQueryRegistry, SheetCommandBus } from '@searsuite/sear-assembly-commands';

import { IsCellEditingQuery, CommitCellEditCommand } from '@searsuite/sear-plugin-cell-editor';
/** Attaches the dropdown presentation to its existing business contribution. */
export function registerSheetDropdownView(container: Container): void {
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
    queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol);
  const plugin = container.resolve<SheetDropdownPlugin>(SheetDropdownPlugin.symbol);
  container.resolve<ViewExtensionRegistry<unknown, CellProperties>>(ViewExtensionRegistry.symbol).register(
    new SheetDropdownView({
      source: plugin,
      commands,
      coordinates: container.resolve<CoordinateEngine>(CoordinateEngine.symbol),
      registry: container.resolve<SheetCellVisualReaderRegistry>(SheetCellVisualReaderRegistry.symbol),
      beforeOpen: () => {
        if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, undefined)) {
          commands.run(CommitCellEditCommand, undefined);
          return !queries.run(IsCellEditingQuery, undefined);
        }
        return true;
      },
    }),
  );
}
