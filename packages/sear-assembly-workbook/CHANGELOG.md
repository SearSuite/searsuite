# @searsuite/sear-assembly-workbook

## 0.0.2

### Patch Changes

- Release the independent Sheet and Workbook kernels with commands, queries, and observations. Separate business plugins from rendering and input views, update embedded document assembly, and fix editing, selection, formula navigation, and input regressions.

  Breaking API change: use the new Sheet state, Sheet kernel, Workbook kernel, and Sheet document assembly entry points. Presentation contributions use viewExtensions separately from business plugins. Header highlighting and zoom now belong to rendering views.

- Updated dependencies
  - @searsuite/sear-assembly-commands@0.0.2
  - @searsuite/sear-assembly-setup@0.0.2
  - @searsuite/sear-assembly-workbook-kernel@0.0.2
  - @searsuite/sear-domain-workbook@0.0.2
