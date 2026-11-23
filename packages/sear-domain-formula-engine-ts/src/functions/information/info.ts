/**
 * INFO: Returns host or workbook environment information.
 * Example: =INFO("numfile")
 */
import { createInformationFunction } from './InformationRuntime';

export const INFO = createInformationFunction('INFO');
