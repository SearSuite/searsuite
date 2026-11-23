/**
 * ISERR: Returns TRUE for errors other than #N/A.
 * Example: =ISERR(1/0)
 */
import { createInformationFunction } from './InformationRuntime';

export const ISERR = createInformationFunction('ISERR');
