# @searsuite/sear-assembly-doc-kernel

Composes document state, transactions, commands, queries, observations, history and plugin lifecycle without Core, rendering or native input adapters.

`createDocKernelEditor` creates an independent document business runtime. Hosts supply a `Platform` implementation and initial `documentState`. `createHeadlessDocEditor` in `@searsuite/sear-assembly-headless` selects Node host services.

```ts
import { createHeadlessDocEditor } from '@searsuite/sear-assembly-headless';
import { InsertDocTextCommand } from '@searsuite/sear-assembly-doc';
import { DocCommitObservation, ReadDocTextQuery } from '@searsuite/sear-assembly-doc-kernel';

const editor = createHeadlessDocEditor({ documentState: { document: [] } });
const unsubscribe = editor.observations.subscribe(DocCommitObservation, commit => {
  console.log(commit.revision, commit.changedOwners);
});
editor.commands.run(InsertDocTextCommand, { text: 'Hello' });
console.log(editor.queries.run(ReadDocTextQuery, undefined));
unsubscribe();
editor.destroy();
```

Commands are the mutation entry point. Queries return detached values or bounded readers; observations deliver committed state without mutation authority. A failed observer cannot roll back a successful commit. Plugins own business state and semantic contributions. Each editor owns its node definitions and registries.

`prepareDocKernel` is the composition entry point shared by business-only and visual hosts. `SearCoreDoc` subscribes to the resulting `DocKernel` publications and owns layout, scene updates and native input presentation. It does not hold a second document snapshot or execute a separate state transaction implementation. Views request edits through the same command bus. Destroying a visual subscriber is separate from destroying the business runtime.

This package is new in the working source tree; use a matching release set when installing from npm.
