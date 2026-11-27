# @searsuite/sear-domain-state

Defines typed data ownership, field projections, state registries, and a presentation-independent transaction kernel.

`StatePlugin<State, Transaction>` owns guarded state and its reducer without requiring scene, pointer, or drawing APIs. `StateKernel` stages detached states, prepares every changed owner before publication, and delivers commit notifications in publication order. The composition root supplies cloning, validation, and exclusive no-throw state publication; it retains responsibility for concrete transaction, history, and persistence contributions.

Call `begin()`, stage transactions on the batch, and `commit()` only after validation succeeds. Call `notify()` after composition-owned post-commit work. Discard a failed batch without publishing it. `preview()` closes a batch and returns detached prospective states without changing committed data. A reducer failure closes its batch; conflicting intervening owner changes invalidate retained batches. Subscribers may detach and reattach without affecting document ownership, and subscriber failures do not invalidate successful commits.

`DataEngine` and its data-view contracts also belong to this package. State-owner identities require only a readonly `key` label; registry membership uses the identity object. Rendering packages re-export the same registry implementation to preserve existing imports.

[API reference](https://searsuite.com/docs/ref/#sear-domain-state)

## Repository

Repository: [searsuite/packages/sear-domain-state](https://github.com/SearSuite/searsuite/tree/main/packages/sear-domain-state).
