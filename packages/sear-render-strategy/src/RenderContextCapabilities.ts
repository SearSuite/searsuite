import { RenderContext } from '@searsuite/sear-render-context';

/** Capability snapshot used by viewport render coordinators before choosing a raster strategy. */
export interface RenderContextCapabilities {
  readonly requiresFrameRebuild: boolean;
  readonly supportsDirtyRedraw: boolean;
  readonly requiresExplicitNodeClear: boolean;
}

export function readRenderContextCapabilities(context: RenderContext): RenderContextCapabilities {
  return {
    requiresFrameRebuild: context.requiresFrameRebuild(),
    supportsDirtyRedraw: context.supportsDirtyRedraw(),
    requiresExplicitNodeClear: context.requiresExplicitNodeClear(),
  };
}

export function requiresViewportFrameRebuild(context: RenderContext): boolean {
  return readRenderContextCapabilities(context).requiresFrameRebuild;
}

export function supportsViewportDirtyRedraw(context: RenderContext): boolean {
  return readRenderContextCapabilities(context).supportsDirtyRedraw;
}

export function requiresViewportExplicitNodeClear(context: RenderContext): boolean {
  return readRenderContextCapabilities(context).requiresExplicitNodeClear;
}
