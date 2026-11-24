# Get started with SearSuite

SearSuite provides TypeScript modules for building spreadsheet experiences that people and AI agents can edit together.

## Install from npm

Use Node.js 22 or newer. Install the public Sheet assembly package in your application:

```bash
npm install @searsuite/sear-assembly-setup
```

The initial npm release is still being staged. This command will become available after `0.0.1` is approved.

The [online demo](https://searsuite.com/) shows an assembled editor in the browser.

## Create a Sheet document

Create initial Sheet state with the installed package:

```typescript
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-setup';

const sheet = createEmptySheetDocumentState(4, 4);
sheet.sheetData.addItem(0, 0, { type: 'string', value: 'Hello' });
```

`createEmptySheetDocumentState(4, 4)` supplies the initial document. To create an editor, provide host rendering and input adapters to `createSheetEditor()`; see the package's public API for the adapter contracts.

The core workspace also provides `@searsuite/sear-assembly-headless` for Sheet and Workbook editors on Node.js and `@searsuite/sear-node-adapters` for platform timing and HTTP services.

## Run tests

For contributors working in this repository, run `pnpm install` and `pnpm run test:unit`.

## Repository

Repository: [searsuite](https://github.com/SearSuite/searsuite).

## Community and releases

See [Contributing](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), [Support and maintainers](SUPPORT.md), the [Changelog](CHANGELOG.md), and [Versioning and compatibility](VERSIONING.md).

Package releases use Changesets for versions and changelogs, followed by npm staged publishing for review and two-factor approval. See [Versioning and compatibility](VERSIONING.md) for the commands and release order.
