# @searsuite/sear-assembly-setup

Composes editor runtimes with commands, queries, and host adapters.

## Start from npm

Use the published `0.0.1` packages with the complete [Sheet](https://searsuite.com/docs/quickstart/#single-sheet) or [Workbook](https://searsuite.com/docs/quickstart/#install) Quickstart. The [standalone npm project](https://github.com/SearSuite/searsuite-browser/tree/main/examples/npm) contains the same code and its own registry lockfile.

`createSheetEditor` requires platform adapters; installing this package alone does not create a browser view. The examples define an application-owned `createBrowserAdapters(canvas)` helper. That helper is not an export of this package. Rich-text cell editing is injected explicitly with `createSheetEmbeddedSearCoreEditor()` from `@searsuite/sear-plugin-sheet-doc-adapter`.

Initialize document state before creating the editor. After creation, mutate through `editor.commands`, read through `editor.queries`, subscribe through `editor.observations`, and call `editor.destroy()` when unmounting. Runtime state snapshots are not durable JSON; Sheet persistence uses the exported `serializeSheetDocumentState` and `deserializeSheetDocumentState` functions.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-setup)

## Repository

Repository: [searsuite/packages/sear-assembly-setup](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-setup).
