# @searsuite/sear-assembly-core

Stages and commits transactions in the Sheet and Doc runtimes.

Sheet state staging and publication use the presentation-independent `StateKernel` from `@searsuite/sear-domain-state`. The Sheet facade retains existing command, transaction projection, history, and collaboration contracts. Its optional view runtime subscribes to completed publications and owns scene refreshes, dirty regions, painting, and scroll-frame scheduling. A view failure is reported through platform diagnostics after the state has committed.

`SheetCommitSnapshot` exposes a publication revision and changed owner identities without exposing mutable plugin instances or state. Read-only empty pipelines do not publish another commit. Document data and local session state remain separate.

Business plugins use neutral state, command, query and observation contracts. They have no Core or rendering dependency. Separate view extensions bind scene generation and native input to the assembled editor. Core coordinates those views but does not add view hooks to the business plugin contract.

[API reference](https://searsuite.com/docs/ref/#sear-assembly-core)

## Repository

Repository: [searsuite/packages/sear-assembly-core](https://github.com/SearSuite/searsuite/tree/main/packages/sear-assembly-core).
