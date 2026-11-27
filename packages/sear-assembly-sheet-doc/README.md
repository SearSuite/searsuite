# @searsuite/sear-assembly-sheet-doc

Adapts the Doc runtime for rich-text editing inside Sheet cells.

Semantic embedded editing policies come from `@searsuite/sear-assembly-doc` and receive immutable document data only. Configure them through `plugins`. Geometry validation, overflow sizing and render notifications belong to independent `viewExtensions`; `SheetCellContextView` and `SheetOverflowView` are installed by default. An empty `viewExtensions` array selects no adapter views.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-sheet-doc)

## Repository

Repository: [searsuite/packages/sear-assembly-sheet-doc](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-sheet-doc).
