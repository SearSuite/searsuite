# @searsuite/sear-plugin-cell-highlight

## 0.0.2

### Patch Changes

- Release the independent Sheet and Workbook kernels with commands, queries, and observations. Separate business plugins from rendering and input views, update embedded document assembly, and fix editing, selection, formula navigation, and input regressions.

  Breaking API change: use the new Sheet state, Sheet kernel, Workbook kernel, and Sheet document assembly entry points. Presentation contributions use viewExtensions separately from business plugins. Header highlighting and zoom now belong to rendering views.

- Updated dependencies
  - @searsuite/sear-assembly-commands@0.0.2
  - @searsuite/sear-assembly-plugin@0.0.2
  - @searsuite/sear-domain-cell-types@0.0.2
  - @searsuite/sear-domain-matrix@0.0.2
  - @searsuite/sear-domain-ot@0.0.2
  - @searsuite/sear-domain-sheet@0.0.2
  - @searsuite/sear-domain-state@0.0.2
  - @searsuite/sear-domain-transaction@0.0.2
  - @searsuite/sear-foundation-di@0.0.2
  - @searsuite/sear-foundation-error@0.0.2
  - @searsuite/sear-foundation-platform@0.0.2
  - @searsuite/sear-foundation-rect@0.0.2
