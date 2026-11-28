# A composable toolkit for building spreadsheet editors

Mature editor toolkits already exist for rich-text documents. Yet developers building online spreadsheets often still have to implement cell models, formulas, editing, and rendering within their own products. Even when open-source editors are available, it may be difficult to use only the capabilities a product needs or adapt them to a different runtime environment. Enterprises that purchase a complete product may face a large feature set and a complex architecture; integrating it with existing systems and adapting it to business workflows can also require costly, paid customization. SearSuite aims to make these foundational capabilities easier to reuse, recombine, and integrate.

SearSuite contributes a collection of composable spreadsheet modules to the open-source ecosystem. Spreadsheet state, commands, rendering, platform adapters, and optional features work together through explicit contracts, allowing developers to select the parts they need, replace implementations independently, or assemble their own editors. Enterprises can integrate these capabilities into existing business systems and extend them themselves, without having to purchase an entire product or depend on paid customization by a vendor. The modules are currently implemented in TypeScript; their clear contracts also provide a path for porting them to other languages in the future.

SearSuite's underlying architecture supports AI-assisted editing, allowing people and AI agents to work on the same spreadsheet through shared state and commands.

## Get started with SearSuite

SearSuite provides TypeScript modules for building spreadsheet experiences that people and AI agents can edit together. Use the published 0.0.3 packages to run a Sheet, a multi-Sheet Workbook or a Node.js Headless editor. The browser examples share one application adapter file.

<a id="choose-editor"></a>

### Choose an editor

- [Workbook](#install): start here for multiple Sheets, formulas, toolbars and tabs.
- [Sheet](#single-sheet): use the same browser setup for one spreadsheet.
- [Headless](#headless): calculate and serialize Sheet data on Node.js, without a browser.

Prefer a ready-to-run project? Copy the [standalone npm examples](https://github.com/SearSuite/searsuite-browser/tree/main/examples/npm) into your application directory and run `npm install`, then `npm run dev`. Open `/` or `/sheet.html` on the printed URL. Run `npm run headless` for Node and `npm test` for its calculation and JSON checks. The project installs registry packages and does not link source workspaces.

<a id="install"></a>

### Install from npm

Use Node.js 22.12 or later. Create a Vite application with the vanilla TypeScript template, then install the Workbook, Sheet, and browser packages. No repository checkout is required.

```bash
npm create vite@6 my-searsuite-app -- --template vanilla-ts
cd my-searsuite-app
npm install
npm install \
  @searsuite/sear-assembly-setup@0.0.3 \
  @searsuite/sear-assembly-workbook@0.0.3 \
  @searsuite/sear-assembly-workbook-kernel@0.0.3 \
  @searsuite/sear-assembly-sheet-state@0.0.3 \
  @searsuite/sear-assembly-sheet-kernel@0.0.3 \
  @searsuite/sear-domain-workbook@0.0.2 \
  @searsuite/sear-browser-adapters@0.0.3 \
  @searsuite/sear-plugin-web-toolbar@0.0.3 \
  @searsuite/sear-plugin-web-sheet-tabbar@0.0.3 \
  @searsuite/sear-assembly-sheet-doc@0.0.3 \
  @searsuite/sear-render-scroll@0.0.3
```

For an existing application, run only the package install command in its project directory. Keep all example dependencies pinned to the tested `0.0.3` release set. A newer source checkout does not change packages already installed from npm.

<a id="create-page"></a>

### Create the page

Replace `index.html` with this page. The workbook has separate containers for the toolbar, formula bar, editing surface, and Sheet tabs. This example uses a fixed 1100 by 480 pixel editing surface.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SearSuite Workbook</title>
    <style>
      body { margin: 0; }
      #workbook { width: 1100px; }
      #canvas { display: block; width: 1100px; height: 480px; }
    </style>
  </head>
  <body>
    <div id="workbook">
      <div id="toolbar"></div>
      <div id="formula-bar"></div>
      <canvas id="canvas"></canvas>
      <div id="bottom-bar"></div>
    </div>
    <script type="module" src="/src/workbook.ts"></script>
  </body>
</html>
```

<a id="browser-adapters"></a>

### Configure browser adapters

Create `src/browser-host.ts`. This application helper supplies Web rendering, scrolling, keyboard and pointer input, clipboard, and toolbar adapters to each mounted Sheet editor. The helper is defined in your application; it is not an export of an npm package.

```typescript
import type { SheetEditorAdapters } from "@searsuite/sear-assembly-setup";
import {
  BrowserPlatform,
  WebCanvasRenderContext,
  WebCursorEngine,
  WebEventRegistrar,
  WebKeyboardRouter,
  WebPointerCapture,
  WebScroller,
  WebSocketTransport,
  WebTextInput,
} from "@searsuite/sear-browser-adapters";
import {
  SearWebToolbar,
  WebFormulaBar,
  WebSheetAdapterDefaults,
} from "@searsuite/sear-plugin-web-toolbar";
import { Scroller } from "@searsuite/sear-render-scroll";

// This helper belongs to the application and supplies its selected browser adapters.
export function createBrowserAdapters(
  canvas: HTMLCanvasElement
): SheetEditorAdapters {
  return {
    ...WebSheetAdapterDefaults,
    platform: BrowserPlatform,
    createRenderContexts() {
      const context = new WebCanvasRenderContext(
        canvas,
        false,
        new BrowserPlatform()
      );
      return {
        renderContext: context,
        offScreenRenderContext: context.cloneNode(),
        hitRenderContext: context.createHitNode(),
      };
    },
    scroller: WebScroller,
    eventRegistrar: WebEventRegistrar,
    textInput: WebTextInput,
    keyboardRouter: WebKeyboardRouter,
    pointerCapture: WebPointerCapture,
    cursorEngine: WebCursorEngine,
    collabTransport: WebSocketTransport,
    toolbar: SearWebToolbar,
    formulaBar: WebFormulaBar,
    registerEnvironment(container) {
      container.registerInstance(Scroller.ContainerSymbol, canvas);
      container.registerInstance(
        WebKeyboardRouter.eventTargetSymbol,
        canvas.ownerDocument
      );
      container.registerInstance(
        WebPointerCapture.eventTargetSymbol,
        canvas.ownerDocument
      );
    },
  };
}
```

`WebSheetAdapterDefaults` supplies text shaping, clipboard, file download, user interaction, XML/XPath, and HTTP adapters. The remaining options bind the Canvas and browser event sources. Registering `WebSocketTransport` does not open a collaboration connection; this example runs locally without a collaboration server.

The `canvas` parameter is supplied by each entry below: `document.querySelector<HTMLCanvasElement>('#canvas')` selects the Canvas created by its HTML page, and `createBrowserAdapters(canvas)` passes that element to the helper. Customize this one file when replacing browser adapters or registering additional host services.

<a id="connect-editor"></a>

### Create the workbook

Create `src/workbook.ts`. It creates two Sheets, enables cross-Sheet formulas, and mounts the toolbar, formula bar, and bottom Sheet tabs.

```typescript
import { SheetViewCapability } from "@searsuite/sear-assembly-setup";
import { createSheetEditor } from "@searsuite/sear-assembly-setup";
import { createEmptySheetDocumentState } from "@searsuite/sear-assembly-sheet-state";

import { createWorkbookEditor } from '@searsuite/sear-assembly-workbook';
import { WorkbookActiveSheetEditorObservation } from '@searsuite/sear-assembly-workbook-kernel';
import { WorkbookFormulaPlugin } from "@searsuite/sear-assembly-workbook-kernel";
import { createWorkbookDocumentState } from "@searsuite/sear-domain-workbook";
import { BrowserPlatform } from "@searsuite/sear-browser-adapters";
import { createSheetEmbeddedSearCoreEditor } from "@searsuite/sear-assembly-sheet-doc";
import { SearWebBottomBar } from "@searsuite/sear-plugin-web-sheet-tabbar";
import { createBrowserAdapters } from "./browser-host";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const toolbarElement = document.querySelector<HTMLElement>("#toolbar")!;
const formulaBarElement = document.querySelector<HTMLElement>("#formula-bar")!;
const bottomBarElement = document.querySelector<HTMLElement>("#bottom-bar")!;

const first = createEmptySheetDocumentState(1000, 26);
first.sheetData.addItem(0, 0, { type: "string", value: "Hello SearSuite" });
first.sheetData.addItem(1, 0, { type: "number", value: 21 });
first.sheetData.addItem(2, 0, { type: "formula", formula: "=A2*2" });

const second = createEmptySheetDocumentState(1000, 26);
second.sheetData.addItem(0, 0, { type: "string", value: "Second Sheet" });
second.sheetData.addItem(1, 0, { type: "formula", formula: "=Sheet1!A2*3" });

const workbook = createWorkbookEditor({
  plugins: [WorkbookFormulaPlugin],
  documentState: createWorkbookDocumentState({
    id: "my-workbook",
    sheets: [
      { id: "sheet-1", name: "Sheet1" },
      { id: "sheet-2", name: "Sheet2" },
    ],
    sheetStates: { "sheet-1": first, "sheet-2": second },
  }),
  viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
  adapters: createBrowserAdapters(canvas),
  sheetEditorFactory: ({ configuration }) =>
    createSheetEditor({
      ...configuration,
      embeddedEditor: createSheetEmbeddedSearCoreEditor(),
    }),
});

function mountSheetChrome() {
  const editor = workbook.sheets.getActiveEditor();
  editor.services.require(SheetViewCapability.Toolbar).mount(toolbarElement);
  editor.services
    .require(SheetViewCapability.FormulaBar)
    .mount(formulaBarElement);
}

mountSheetChrome();
const unsubscribe = workbook.observations.subscribe(
  WorkbookActiveSheetEditorObservation,
  mountSheetChrome
);

const bottomBar = new SearWebBottomBar(new BrowserPlatform());
bottomBar.mount(bottomBarElement, {
  workbook: {
    editor: workbook,
    createSheetState: () => createEmptySheetDocumentState(1000, 26),
  },
});

function destroy() {
  unsubscribe();
  bottomBar.destroy();
  workbook.destroy();
}

if (import.meta.hot) {
  import.meta.hot.dispose(destroy);
}
```

`WorkbookFormulaPlugin` enables cross-Sheet formula references. Workbook history is already installed by the default assembly; do not register `WorkbookHistoryPlugin` again. Use `plugins` for Workbook plugins and `sheetPlugins` for additional Sheet plugins.

Each Sheet has a stable id and its own document state. The `sheetEditorFactory` adds the embedded rich-text editor whenever the Workbook mounts a Sheet. Switching Sheets replaces the active Sheet editor, so `WorkbookActiveSheetEditorObservation` remounts its toolbar and formula bar. The bottom bar stays bound to the Workbook and creates an empty Sheet when its add button is clicked.

Call `destroy()` when the application view unmounts. It releases the host subscription, bottom bar, and Workbook-owned editors. The final block handles Vite hot updates. The document state lives in memory; reloading the page restores the initial example data.

<a id="start"></a>

### Start and try the workbook

```bash
npm run dev
```

Open the URL printed by Vite. On Sheet1, A2 contains 21 and A3 evaluates `=A2*2` to 42. Switch to Sheet2: A2 evaluates `=Sheet1!A2*3` to 63. Change Sheet1 A2 to 42, then verify that Sheet1 A3 becomes 84 and Sheet2 A2 becomes 126. Use the bottom bar to add a Sheet, or the toolbar to undo and redo a cell edit.

Continue below for complete single-Sheet and Headless entries. See the [host application guide](https://searsuite.com/docs/guide/#host), [Workbook API reference](https://searsuite.com/docs/ref/#sear-assembly-workbook), and [Sheet API reference](https://searsuite.com/docs/ref/#sear-assembly-setup) for further integration.

<a id="single-sheet"></a>

### Run one Sheet

Reuse the browser installation and `src/browser-host.ts` above. Add `sheet.html` and `src/sheet.ts`, then open `/sheet.html` on the Vite URL. A2 contains 21 and A3 calculates `=A2*2` to 42. Change A2 to check recalculation, then use the toolbar to undo and redo. A single Sheet does not need Workbook assembly or Sheet tabs.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SearSuite Sheet</title>
    <style>
      body { margin: 0; }
      #sheet { width: 1100px; }
      #canvas { display: block; width: 1100px; height: 480px; }
    </style>
  </head>
  <body>
    <div id="sheet">
      <div id="toolbar"></div>
      <div id="formula-bar"></div>
      <canvas id="canvas"></canvas>
    </div>
    <script type="module" src="/src/sheet.ts"></script>
  </body>
</html>
```

```typescript
import { SheetViewCapability } from "@searsuite/sear-assembly-setup";
import { createSheetEditor } from "@searsuite/sear-assembly-setup";
import { createEmptySheetDocumentState } from "@searsuite/sear-assembly-sheet-state";

import { createSheetEmbeddedSearCoreEditor } from "@searsuite/sear-assembly-sheet-doc";
import { createBrowserAdapters } from "./browser-host";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const sheetState = createEmptySheetDocumentState(1000, 26);
sheetState.sheetData.addItem(0, 0, {
  type: "string",
  value: "Hello SearSuite",
});
sheetState.sheetData.addItem(1, 0, { type: "number", value: 21 });
sheetState.sheetData.addItem(2, 0, { type: "formula", formula: "=A2*2" });

const editor = createSheetEditor({
  sheetState,
  viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
  adapters: createBrowserAdapters(canvas),
  embeddedEditor: createSheetEmbeddedSearCoreEditor(),
});

editor.services
  .require(SheetViewCapability.Toolbar)
  .mount(document.querySelector("#toolbar"));
editor.services
  .require(SheetViewCapability.FormulaBar)
  .mount(document.querySelector("#formula-bar"));

function destroy() {
  editor.destroy();
}

if (import.meta.hot) {
  import.meta.hot.dispose(destroy);
}
```

`createSheetEditor()` installs the default Sheet feature bundle. `createSheetEmbeddedSearCoreEditor()` adds rich-text cell editing explicitly. After editor creation, send changes through typed commands rather than mutating the initial state.

<a id="headless"></a>

### Run on Node.js

Headless can run independently of the browser application. In a new directory, install only these four packages. Use Node.js 22.12 or later; no Canvas, browser adapter, Vite or DOM is required.

```bash
mkdir searsuite-headless
cd searsuite-headless
npm init -y
npm install @searsuite/sear-assembly-headless@0.0.3 @searsuite/sear-assembly-sheet-state@0.0.3 @searsuite/sear-assembly-sheet-kernel@0.0.3 @searsuite/sear-plugin-formula@0.0.3
```

Create `headless.mjs`, then run `node headless.mjs`:

```javascript
import { createEmptySheetDocumentState, serializeSheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { createHeadlessEditor } from '@searsuite/sear-assembly-headless';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';

const sheetState = createEmptySheetDocumentState(10, 10);
sheetState.sheetData.addItem(0, 0, { type: 'number', value: 21 });
sheetState.sheetData.addItem(1, 0, { type: 'formula', formula: '=A1*2' });

const editor = createHeadlessEditor({ sheetState });
try {
  await waitForFormulaIdle(editor.commands);
  const { status } = editor.commands.run(GetFormulaCellStatusCommand, { row: 1, col: 0 });
  console.log('A2 =', status.result); // 42

  const snapshot = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
  const json = JSON.stringify(serializeSheetDocumentState(snapshot));
  console.log('Document JSON:', json);
  // Store json in your file/database. Restore with deserializeSheetDocumentState(JSON.parse(json)).
} finally {
  editor.destroy();
}
```

The script waits for formula work to finish, prints `A2 = 42`, produces a durable JSON payload and releases the editor in `finally`. For a multi-Sheet Node runtime, `createHeadlessWorkbookEditor()` accepts Workbook state and `plugins: [WorkbookFormulaPlugin]` in the same way as the browser Workbook.

<a id="integration-notes"></a>

### Lifecycle, persistence and release notes

The browser entries define `destroy()` and register it with Vite hot updates. In React, Vue or another host, call that cleanup when its editor view unmounts. A Workbook owns its mounted Sheet editors; destroy its host subscriptions and bottom bar before destroying the Workbook.

Browser edits remain in memory and a page reload restores the seed data. `ExportSheetStateCommand` and `ExportWorkbookStateCommand` return runtime snapshots, not a durable file format. Use `serializeSheetDocumentState()` or `serializeWorkbookDocumentState()` before JSON encoding, then the matching `deserialize*DocumentState()` before creating a new editor. Your application owns storage. Additional state-owning plugins must supply their document codecs; CSV/XLSX import, server persistence and collaboration are not configured here.

The default assembly installs its own feature bundle and Workbook history. Do not add a second history plugin or suppress runtime diagnostics. See the [example README](https://github.com/SearSuite/searsuite-browser/tree/main/examples/npm#plugins-and-lifecycle) for default plugins, cleanup and the scope of the npm checks.

## Repository

Repository: [searsuite](https://github.com/SearSuite/searsuite).

## Community and releases

See [Contributing](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), [Support and maintainers](SUPPORT.md), the [Changelog](CHANGELOG.md), and [Versioning and compatibility](VERSIONING.md).

Package releases use Changesets for versions and changelogs, followed by npm staged publishing for review and two-factor approval. See [Versioning and compatibility](VERSIONING.md) for the commands and release order.
