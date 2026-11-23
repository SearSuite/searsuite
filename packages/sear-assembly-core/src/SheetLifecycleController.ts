import { type SearCoreSheet } from './SearCoreSheet';

/** Shared context supplied to lifecycle controllers for one sheet instance. */
export interface SheetLifecycleContext {
  readonly core: SearCoreSheet;
  refreshSheetBoundaries(): void;
}

/** A startable and disposable runtime concern owned by a sheet instance. */
export interface SheetLifecycleController {
  start(context: SheetLifecycleContext): void;
  destroy(): void;
}
