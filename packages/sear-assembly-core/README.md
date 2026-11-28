# @searsuite/sear-assembly-core

Attaches Sheet and Doc presentation to independent business kernels.

`SearCoreSheet` consumes `SheetKernel` and `SearCoreDoc` consumes `DocKernel`. Both business kernels stage state and publish commits through `StateKernel` from `@searsuite/sear-domain-state`. Core delegates transactions to those kernels and subscribes to completed publications; it owns scene refreshes, derived document layout, dirty regions, painting and scroll-frame scheduling. Core stores no second document snapshot. `DocEditorLayout` derives geometry for standalone Doc and Sheet-embedded text without requiring another business kernel. A view failure is reported through platform diagnostics after the state has committed.

`SheetCommitSnapshot` and `DocCommitSnapshot` expose a publication revision and changed owner identities without exposing mutable plugin instances or state. Read-only empty pipelines do not publish another commit. Document data and local session state remain separate.

Business plugins use neutral state, command, query and observation contracts. They have no Core or rendering dependency. Separate view extensions bind scene generation and native input to the assembled editor. Core coordinates those views but does not add view hooks to the business plugin contract.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-core)

## Repository

Repository: [searsuite/packages/sear-assembly-core](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-core).
