# @searsuite/sear-assembly-doc-kernel

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
  - @searsuite/sear-domain-doc@0.0.3
  - @searsuite/sear-domain-editor@0.0.3
