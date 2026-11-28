# @searsuite/sear-assembly-sheet-kernel

## 0.0.3

### Patch Changes

- Separate document and spreadsheet business kernels from presentation.

  Add the independent document kernel and Headless document entry, share business assembly between visual and Headless hosts, isolate editor-local node registrations, and make collaboration and toolbars optional. Embedded document presentation shares the pure layout service without creating a second business runtime.

  Breaking changes: document node registration is editor-local; visual documents require an event registrar; Core document snapshot load/export APIs are replaced by business commands and queries. Update dependent packages to consume the same contracts.

- Updated dependencies
  - @searsuite/sear-assembly-commands@0.0.3
  - @searsuite/sear-assembly-config@0.0.3
  - @searsuite/sear-assembly-doc@0.0.3
  - @searsuite/sear-assembly-plugin@0.0.3
  - @searsuite/sear-assembly-sheet-state@0.0.3
  - @searsuite/sear-domain-cell@0.0.3
  - @searsuite/sear-domain-cell-types@0.0.3
  - @searsuite/sear-domain-formula-engine@0.0.3
  - @searsuite/sear-domain-formula-engine-ts@0.0.3
  - @searsuite/sear-domain-sheet@0.0.3
  - @searsuite/sear-plugin-alignment@0.0.3
  - @searsuite/sear-plugin-cell-border@0.0.3
  - @searsuite/sear-plugin-cell-editor@0.0.3
  - @searsuite/sear-plugin-cell-fill@0.0.3
  - @searsuite/sear-plugin-cell-format@0.0.3
  - @searsuite/sear-plugin-cell-highlight@0.0.3
  - @searsuite/sear-plugin-cell-merge@0.0.3
  - @searsuite/sear-plugin-checkbox@0.0.3
  - @searsuite/sear-plugin-clear-style@0.0.3
  - @searsuite/sear-plugin-clipboard@0.0.3
  - @searsuite/sear-plugin-collab@0.0.3
  - @searsuite/sear-plugin-data-validation@0.0.3
  - @searsuite/sear-plugin-dropdown@0.0.3
  - @searsuite/sear-plugin-duplicate@0.0.3
  - @searsuite/sear-plugin-filter@0.0.3
  - @searsuite/sear-plugin-find-replace@0.0.3
  - @searsuite/sear-plugin-fixed-row@0.0.3
  - @searsuite/sear-plugin-format-painter@0.0.3
  - @searsuite/sear-plugin-formula@0.0.3
  - @searsuite/sear-plugin-freeze@0.0.3
  - @searsuite/sear-plugin-history@0.0.3
  - @searsuite/sear-plugin-resize@0.0.3
  - @searsuite/sear-plugin-selection@0.0.3
  - @searsuite/sear-plugin-sheet-data@0.0.3
  - @searsuite/sear-plugin-sort@0.0.3

## 0.0.2

### Patch Changes

- Release the independent Sheet and Workbook kernels with commands, queries, and observations. Separate business plugins from rendering and input views, update embedded document assembly, and fix editing, selection, formula navigation, and input regressions.

  Breaking API change: use the new Sheet state, Sheet kernel, Workbook kernel, and Sheet document assembly entry points. Presentation contributions use viewExtensions separately from business plugins. Header highlighting and zoom now belong to rendering views.

- Updated dependencies
- Updated dependencies [611cd7b]
  - @searsuite/sear-assembly-commands@0.0.2
  - @searsuite/sear-assembly-config@0.0.2
  - @searsuite/sear-assembly-doc@0.0.2
  - @searsuite/sear-assembly-plugin@0.0.2
  - @searsuite/sear-assembly-sheet-state@0.0.2
  - @searsuite/sear-domain-cell@0.0.2
  - @searsuite/sear-domain-cell-types@0.0.2
  - @searsuite/sear-domain-doc-schema@0.0.2
  - @searsuite/sear-domain-formula-engine@0.0.2
  - @searsuite/sear-domain-formula-engine-ts@0.0.2
  - @searsuite/sear-domain-matrix@0.0.2
  - @searsuite/sear-domain-ot@0.0.2
  - @searsuite/sear-domain-sheet@0.0.2
  - @searsuite/sear-domain-state@0.0.2
  - @searsuite/sear-domain-transaction@0.0.2
  - @searsuite/sear-foundation-di@0.0.2
  - @searsuite/sear-foundation-error@0.0.2
  - @searsuite/sear-foundation-platform@0.0.2
  - @searsuite/sear-foundation-rect@0.0.2
  - @searsuite/sear-foundation-subscription@0.0.2
  - @searsuite/sear-foundation-user-interaction@0.0.2
  - @searsuite/sear-foundation-utils@0.0.2
  - @searsuite/sear-plugin-alignment@0.0.2
  - @searsuite/sear-plugin-cell-border@0.0.2
  - @searsuite/sear-plugin-cell-editor@0.0.2
  - @searsuite/sear-plugin-cell-fill@0.0.2
  - @searsuite/sear-plugin-cell-format@0.0.2
  - @searsuite/sear-plugin-cell-highlight@0.0.2
  - @searsuite/sear-plugin-cell-merge@0.0.2
  - @searsuite/sear-plugin-checkbox@0.0.2
  - @searsuite/sear-plugin-clear-style@0.0.2
  - @searsuite/sear-plugin-clipboard@0.0.2
  - @searsuite/sear-plugin-collab@0.0.2
  - @searsuite/sear-plugin-data-validation@0.0.2
  - @searsuite/sear-plugin-dropdown@0.0.2
  - @searsuite/sear-plugin-duplicate@0.0.2
  - @searsuite/sear-plugin-filter@0.0.2
  - @searsuite/sear-plugin-find-replace@0.0.2
  - @searsuite/sear-plugin-fixed-row@0.0.2
  - @searsuite/sear-plugin-format-painter@0.0.2
  - @searsuite/sear-plugin-formula@0.0.2
  - @searsuite/sear-plugin-freeze@0.0.2
  - @searsuite/sear-plugin-history@0.0.2
  - @searsuite/sear-plugin-resize@0.0.2
  - @searsuite/sear-plugin-selection@0.0.2
  - @searsuite/sear-plugin-sheet-data@0.0.2
  - @searsuite/sear-plugin-sort@0.0.2
