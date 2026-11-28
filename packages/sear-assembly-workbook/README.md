# @searsuite/sear-assembly-workbook

Attaches visual Sheet sessions and viewport/chrome wiring to `sear-assembly-workbook-kernel`.

The neutral Workbook runtime owns document structure, canonical Sheet snapshots, session restoration, commands and active Sheet replacement. The selected visual Sheet client uses the same `prepareSheetKernel` business assembly as Headless and subscribes to committed publications. Switching Sheets captures business/session state and remounts the active client; collaboration channels, when selected, remain Workbook-owned. Rendering and native input do not participate in state transaction reduction.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-workbook)

## Repository

Repository: [searsuite/packages/sear-assembly-workbook](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-workbook).
