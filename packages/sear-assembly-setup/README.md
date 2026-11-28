# @searsuite/sear-assembly-setup

Composes editor runtimes with commands, queries, and host adapters.

## Start from npm

Use the matching package releases with the complete [Sheet](https://searsuite.com/docs/quickstart/#single-sheet) or [Workbook](https://searsuite.com/docs/quickstart/#install) Quickstart. The [standalone npm project](https://github.com/SearSuite/searsuite-browser/tree/main/examples/npm) contains the same code.

`createSheetEditor` requires platform adapters; installing this package alone does not create a browser view. The examples define an application-owned `createBrowserAdapters(canvas)` helper. That helper is not an export of this package. Rich-text cell presentation defaults to the real embedded Doc view from `@searsuite/sear-assembly-sheet-doc`; hosts can explicitly replace `embeddedEditor`. A toolbar and collaboration transport are optional.

Initialize document state before creating the editor. After creation, mutate through `editor.commands`, read through `editor.queries`, subscribe through `editor.observations`, and call `editor.destroy()` when unmounting. Runtime state snapshots are not durable JSON; Sheet persistence uses `serializeSheetDocumentState` and `deserializeSheetDocumentState` from `@searsuite/sear-assembly-sheet-state`.

`plugins` installs state and business behavior; `viewExtensions` installs independent `SheetView` implementations for drawing and input. Doc composition uses the corresponding `DocView` contract. Sheet and Doc visual factories attach to the same business assembly used by their Headless factories. Visual Doc hosts explicitly supply an event registrar; no empty native adapter is installed automatically. Business plugins declare neutral commands, queries, observations and state contributions; they do not receive Core or render objects.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-setup)

## Repository

Repository: [searsuite/packages/sear-assembly-setup](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-setup).
