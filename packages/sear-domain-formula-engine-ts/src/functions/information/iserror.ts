/**
 * ISERROR: Returns TRUE for any formula error.
 * Example: =ISERROR(1/0)
 */
import { createInformationFunction } from './InformationRuntime';

export const ISERROR = createInformationFunction('ISERROR');
