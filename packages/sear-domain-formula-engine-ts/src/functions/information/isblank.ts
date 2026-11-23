/**
 * ISBLANK: Returns TRUE only for a genuinely empty referenced cell.
 * Example: =ISBLANK(A1)
 */
import { createInformationFunction } from './InformationRuntime';

export const ISBLANK = createInformationFunction('ISBLANK');
