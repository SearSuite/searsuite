# @searsuite/sear-assembly-headless

Creates Sheet, Workbook and Doc editors for tests, servers, and other runtimes without a visual host.

## Start from npm

This example follows the current source API and requires an updated npm release; the Doc kernel entry requires a matching release of the new document business package. Use Node.js 22 or later. Install the Headless runtime and the APIs used by this example:

```sh
npm install @searsuite/sear-assembly-headless @searsuite/sear-assembly-sheet-state @searsuite/sear-plugin-formula
```

Create `headless.mjs`, then run `node headless.mjs`:

```js
import { createHeadlessEditor } from '@searsuite/sear-assembly-headless';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';

const sheetState = createEmptySheetDocumentState(4, 4);
sheetState.sheetData.addItem(0, 0, { type: 'number', value: 21 });
sheetState.sheetData.addItem(1, 0, { type: 'formula', formula: '=A1*2' });

const editor = createHeadlessEditor({ sheetState });
try {
  await waitForFormulaIdle(editor.commands);
  console.log(editor.commands.run(GetFormulaCellStatusCommand, { row: 1, col: 0 }).status.result); // 42
} finally {
  editor.destroy();
}
```

Headless composition omits the Sheet view subscriber: it does not automatically generate scene nodes or paint after commits. State, formula, command, query, observation, history, and persistence behavior remain available. `SheetCommitObservation` from `@searsuite/sear-assembly-sheet-kernel` exposes the current publication revision and changed state-owner identities. Subscriptions receive an initial snapshot; empty read-only pipelines do not generate further commit notifications.

Business plugins run without Core, rendering types or view hooks. Headless composes the independent Sheet and Workbook business runtimes directly. Its dependency graph contains no scene, renderer, native input adapters or visual assembly. Visual hosts attach presentation through their own assembly.

No browser, Canvas or Vite is needed. The `.mjs` extension enables ESM imports and top-level `await`. Formula evaluation is scheduled, so wait for idle before reading a computed result.

## Workbook and persistence

`createHeadlessWorkbookEditor` accepts `documentState` created with `createWorkbookDocumentState` from `@searsuite/sear-domain-workbook`. Install the Workbook packages when using that API. Add `plugins: [WorkbookFormulaPlugin]` from `@searsuite/sear-assembly-workbook-kernel` for cross-Sheet formulas. History is already installed by default; do not register `WorkbookHistoryPlugin` again. The Workbook owns its mounted Sheet editors and must be destroyed as a unit.

For durable Sheet JSON, obtain the runtime state through `ExportSheetStateCommand` from `@searsuite/sear-assembly-sheet-kernel` and pass its `sheetState` to `serializeSheetDocumentState` before JSON encoding. Restore using `deserializeSheetDocumentState`. Workbook persistence uses `serializeWorkbookDocumentState` / `deserializeWorkbookDocumentState`. These serializers encode document data, not active selections, UI sessions or arbitrary plugin caches; extra document owners must contribute codecs.

See the [complete Headless example](https://searsuite.com/docs/quickstart/#headless) and the [standalone npm project](https://github.com/SearSuite/searsuite-browser/tree/main/examples/npm) for calculation, serialization and round-trip checks against matching package releases. Network-backed formula services and storage are host responsibilities.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-headless)

## Document runtime

`createHeadlessDocEditor({ documentState: { document: [] } })` creates a document business runtime with default semantic plugins, editing, selection, undo/redo, queries, committed observations and session restoration. It requires no renderer, text shaper, native input or toolbar. See [Doc kernel](../sear-assembly-doc-kernel/README.md) for a complete example.

Collaboration is optional. Sheet and Workbook hosts register collaboration capabilities and commands only when they explicitly provide a transport. An editor without a transport retains local history and editing; it does not claim a successful network connection.
