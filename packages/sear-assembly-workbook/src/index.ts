/**
 * Workbook structure, Sheet mounting, workbook commands, sessions, and shared runtime services.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 create-workbook Compose a Workbook around Sheet editors
 * @referenceBody
 * `createWorkbookEditor()` creates the Workbook runtime and mounts a Sheet editor for the active Sheet. The Workbook
 * owns structure and shared services; the mounted Sheet editor owns its own commands, queries, services, and
 * selected plugins. `WorkbookEditor` keeps structural reads under `document` and mounted-Sheet access under `sheets`.
 *
 * **Use when:** a product needs several Sheets with stable identities, switching, structural commands, or shared
 * Workbook services. A single Sheet host can use `createSheetEditor()` directly.
 */

/**
 * @referenceChapter 1 switch-and-change Switch Sheets without conflating state
 * @referenceBody
 * `ActivateWorkbookSheetCommand` captures the current Sheet document and local session, tears down that Sheet
 * editor, and mounts the requested Sheet. The session is restored when returning to it. Workbook structural commands
 * such as `AddWorkbookSheetCommand` and `RenameWorkbookSheetCommand` stage changes in a separate history from cell
 * edits inside the active Sheet.
 *
 * Stable `sheetId` values identify Sheets across rename and reorder operations. A host should use the Workbook
 * document API for structure and the mounted Sheet API for content. `WorkbookPlugin` contributions can own shared
 * services that survive a Sheet remount.
 */

export { createWorkbookEditor } from './createWorkbookEditor';
export {
  type WorkbookEditorConfiguration,
  type WorkbookSheetEditorFactory,
  type WorkbookSheetEditorFactoryInput,
} from './WorkbookEditorContracts';
