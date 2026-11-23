/** Identity of the mounted sheet, stable across workbook sheet remounts. */
export class SheetClipboardSheetIdentity {
  public static readonly symbol = Symbol.for('SheetClipboardSheetIdentity');
  public constructor(public readonly id: string) {}
}
