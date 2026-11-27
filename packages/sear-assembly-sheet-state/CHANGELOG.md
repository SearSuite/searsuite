# @searsuite/sear-assembly-sheet-state

## 0.0.2

### Patch Changes

- Release the independent Sheet and Workbook kernels with commands, queries, and observations. Separate business plugins from rendering and input views, update embedded document assembly, and fix editing, selection, formula navigation, and input regressions.

  Breaking API change: use the new Sheet state, Sheet kernel, Workbook kernel, and Sheet document assembly entry points. Presentation contributions use viewExtensions separately from business plugins. Header highlighting and zoom now belong to rendering views.

- Updated dependencies
  - @searsuite/sear-assembly-plugin@0.0.2
  - @searsuite/sear-domain-matrix@0.0.2
  - @searsuite/sear-domain-sheet@0.0.2
  - @searsuite/sear-foundation-error@0.0.2
  - @searsuite/sear-foundation-rect@0.0.2
  - @searsuite/sear-plugin-alignment@0.0.2
  - @searsuite/sear-plugin-cell-border@0.0.2
  - @searsuite/sear-plugin-cell-fill@0.0.2
  - @searsuite/sear-plugin-cell-format@0.0.2
  - @searsuite/sear-plugin-cell-highlight@0.0.2
  - @searsuite/sear-plugin-cell-merge@0.0.2
  - @searsuite/sear-plugin-data-validation@0.0.2
  - @searsuite/sear-plugin-duplicate@0.0.2
  - @searsuite/sear-plugin-export@0.0.2
  - @searsuite/sear-plugin-filter@0.0.2
  - @searsuite/sear-plugin-fixed-row@0.0.2
  - @searsuite/sear-plugin-freeze@0.0.2
  - @searsuite/sear-plugin-resize@0.0.2
  - @searsuite/sear-plugin-sheet-data@0.0.2
