/**
 * Displays a formatted plugin name and version message in the browser console.
 *
 * This utility function is commonly used during plugin initialization to display
 * a branded message that helps users and developers identify which plugins are
 * loaded and their versions. The output is styled with colors and formatting
 * for better visibility in the browser console.
 *
 * Console Output Example:
 * ```
 * [dark background with white text] sear-editor [light background with dark text] v1.0.0
 * ```
 *
 * Use Cases:
 * - Plugin initialization logging
 * - Version tracking and debugging
 * - User-visible plugin identification
 * - Development and testing environments
 *
 * @param name - The name of the plugin or component (e.g., 'sear-editor', 'sear-table')
 * @param version - The version string of the plugin (e.g., '1.0.0', '2.1.5-beta')
 *
 * @example
 * ```typescript
 * import { printNameAndVersion } from '@searsuite/sear-foundation-common';\n *
 * // Display plugin info on initialization
 * printNameAndVersion('SearEditor', '1.2.3');
 * // Console output: \" SearEditor  v1.2.3 \" with styling
 * ```
 */
export function printNameAndVersion(name: string, version: string): void {
  console.log(
    `%c ${name} %c v${version} `,
    'background:#111827;color:#f9fafb;border-radius:4px 0 0 4px;padding:3px 6px;font:600 11px/1 ui-monospace,monospace;',
    'background:#38bdf8;color:#082f49;border-radius:0 4px 4px 0;padding:3px 6px;font:600 11px/1 ui-monospace,monospace;',
  );
}
