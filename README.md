# Get started with SearSuite

SearSuite provides TypeScript modules for building spreadsheet experiences that people and AI agents can edit together.

## Install from npm

Use Node.js 22 or newer. Install the public Sheet assembly package in your application:

```bash
npm install @searsuite/sear-assembly-setup
```

The initial `0.0.1` release is available on npm. The examples below and in the Quickstart use that tested release set. Source checkout changes are released separately.

The [online demo](https://searsuite.com/) shows an assembled editor in the browser.

## Create a Sheet document

Create initial Sheet state with the installed package:

```typescript
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-setup';

const sheet = createEmptySheetDocumentState(4, 4);
sheet.sheetData.addItem(0, 0, { type: 'string', value: 'Hello' });
```

`createEmptySheetDocumentState(4, 4)` supplies the initial document; this snippet alone does not mount a visible editor. To create one, provide host rendering and input adapters to `createSheetEditor()`. The [npm Quickstart](https://searsuite.com/docs/quickstart/) includes the complete HTML, Canvas setup, adapter helper, toolbar and teardown.

The core workspace also provides `@searsuite/sear-assembly-headless` for Sheet and Workbook editors on Node.js and `@searsuite/sear-node-adapters` for platform timing and HTTP services.

## Choose a runtime

| Runtime | Entry point | Complete example |
| --- | --- | --- |
| Sheet | `createSheetEditor` from `@searsuite/sear-assembly-setup` | [Browser Sheet](https://searsuite.com/docs/quickstart/#single-sheet) |
| Workbook | `createWorkbookEditor` from `@searsuite/sear-assembly-workbook` | [Multiple Sheets, formulas and tabs](https://searsuite.com/docs/quickstart/#install) |
| Node.js | `createHeadlessEditor` / `createHeadlessWorkbookEditor` from `@searsuite/sear-assembly-headless` | [Headless calculation and JSON](https://searsuite.com/docs/quickstart/#headless) |

The [standalone npm examples](https://github.com/SearSuite/searsuite-browser/tree/main/examples/npm) include these three runtimes. They install published packages without workspace links or source aliases and include strict type checks, a production build and Node smoke tests. Browser examples require Node.js 22.12 or later for Vite.

## Run without a browser

In an application directory, install:

```sh
npm install @searsuite/sear-assembly-headless@0.0.1 @searsuite/sear-assembly-setup@0.0.1 @searsuite/sear-plugin-formula@0.0.1
```

Create `headless.mjs` and run `node headless.mjs`:

```js
import { createHeadlessEditor } from '@searsuite/sear-assembly-headless';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-setup';
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

Seed document state before creating the editor. After creation, use typed commands for mutations, queries for reads and observations for updates. Call `destroy()` when the editor is no longer needed. For Workbook cross-Sheet calculation, explicitly add `WorkbookFormulaPlugin` to `plugins`; Workbook history is already registered by default.

Runtime snapshots returned by `Export*StateCommand` are for in-memory use. For durable Sheet/Workbook JSON, use `serializeSheetDocumentState` / `serializeWorkbookDocumentState` and restore with the matching deserializer. Application code owns storage and collaboration connections; merely registering a browser transport does not connect a server.

## Run tests

For contributors working in this repository, run `pnpm install` and `pnpm run test:unit`.

## Repository

Repository: [searsuite](https://github.com/SearSuite/searsuite).

## Community and releases

See [Contributing](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), [Support and maintainers](SUPPORT.md), the [Changelog](CHANGELOG.md), and [Versioning and compatibility](VERSIONING.md).

Package releases use Changesets for versions and changelogs, followed by npm staged publishing for review and two-factor approval. See [Versioning and compatibility](VERSIONING.md) for the commands and release order.
