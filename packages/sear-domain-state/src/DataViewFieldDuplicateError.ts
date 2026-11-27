import { SearError } from '@searsuite/sear-foundation-error';

/** Error thrown when two different state owners try to publish the same data view field. */
export class DataViewFieldDuplicateError extends SearError {
  /** Stable machine-readable code for duplicate data view field registrations. */
  public override readonly code = 'DATA_VIEW_FIELD_DUPLICATE';

  /**
   * Creates a duplicate data view field error.
   * @param details - View key, field key, existing owner, and conflicting owner.
   */
  public constructor(details: { viewKey: string; fieldKey: string; existingOwnerKey: string; ownerKey: string }) {
    super(`Data view field "${details.viewKey}.${details.fieldKey}" is already registered.`, details);
  }
}
