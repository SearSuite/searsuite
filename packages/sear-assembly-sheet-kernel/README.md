# @searsuite/sear-assembly-sheet-kernel

Composes Sheet state owners, transactional commands, queries, subscriptions and host services. Rendering and native input attach through independent consumers.

`prepareSheetKernel` is the shared business assembly for `createSheetKernelEditor` and the visual `createSheetEditor` host. Business plugins initialize through this single lifecycle. The view consumes the same kernel's committed publications; it does not create another command executor or state store. Toolbar and collaboration are selected capabilities, not prerequisites for business runtime creation.
