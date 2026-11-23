/**
 * ISFORMULA: Returns TRUE when a referenced cell contains a formula.
 * Example: =ISFORMULA(A1)
 */
import { createInformationFunction } from './InformationRuntime';

export const ISFORMULA = createInformationFunction('ISFORMULA');
