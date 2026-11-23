/**
 * ERROR.TYPE: Returns the numeric code for an error value.
 * Example: =ERROR.TYPE(NA())
 */
import { createInformationFunction } from './InformationRuntime';

export const ERROR_TYPE = createInformationFunction('ERROR.TYPE');
