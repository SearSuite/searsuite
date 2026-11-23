/**
 * CELL: Returns information about a referenced cell.
 * Example: =CELL("row",B3)
 */
import { createInformationFunction } from './InformationRuntime';

export const CELL = createInformationFunction('CELL');
