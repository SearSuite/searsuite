# @searsuite/sear-assembly-headless

## 0.0.2

### Patch Changes

- Release the independent Sheet and Workbook kernels with commands, queries, and observations. Separate business plugins from rendering and input views, update embedded document assembly, and fix editing, selection, formula navigation, and input regressions.

  Breaking API change: use the new Sheet state, Sheet kernel, Workbook kernel, and Sheet document assembly entry points. Presentation contributions use viewExtensions separately from business plugins. Header highlighting and zoom now belong to rendering views.

- Updated dependencies
  - @searsuite/sear-assembly-commands@0.0.2
  - @searsuite/sear-assembly-sheet-kernel@0.0.2
  - @searsuite/sear-assembly-workbook-kernel@0.0.2
  - @searsuite/sear-domain-formula-engine@0.0.2
  - @searsuite/sear-domain-formula-engine-ts@0.0.2
  - @searsuite/sear-foundation-di@0.0.2
  - @searsuite/sear-foundation-platform@0.0.2
  - @searsuite/sear-node-adapters@0.0.2
  - @searsuite/sear-plugin-collab@0.0.2
