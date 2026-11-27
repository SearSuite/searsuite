# @searsuite/sear-assembly-plugin

Defines plugin lifecycle, state contributions, services, and extension registries.

`Plugin` extends the presentation-independent `StatePlugin` ownership contract from `@searsuite/sear-domain-state`. Plugins own state reduction, transaction algebra, document codecs and neutral data projections. Sheet, Doc and Workbook feature contracts add commands, queries, observations and session registration without exposing Core, render nodes or native input types.

Presentation uses separate `SheetView` and `DocView` extensions from `@searsuite/sear-assembly-setup`. These extensions own painting, layout and input and are selected independently at composition time. A business plugin initializes and executes commands without a mounted view.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-plugin)

## Repository

Repository: [searsuite/packages/sear-assembly-plugin](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-plugin).
