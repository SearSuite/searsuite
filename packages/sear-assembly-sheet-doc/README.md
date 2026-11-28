# @searsuite/sear-assembly-sheet-doc

Attaches rich-text layout, painting and input views to the Sheet-owned semantic document edit model.

Semantic embedded editing policies come from `@searsuite/sear-assembly-doc` and receive immutable document data only. Configure them through `plugins`. Geometry validation, overflow sizing and render notifications belong to independent `viewExtensions`; `SheetCellContextView` and `SheetOverflowView` are installed by default. An empty `viewExtensions` array selects no adapter views.

`DocEditorLayout` is shared with standalone Doc presentation. Measuring, painting and hit-testing do not construct a DocKernel, DocInputPlugin or business PluginManager. Active edit views subscribe to the supplied business model; document commits continue through Sheet commands.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-sheet-doc)

## Repository

Repository: [searsuite/packages/sear-assembly-sheet-doc](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-sheet-doc).
