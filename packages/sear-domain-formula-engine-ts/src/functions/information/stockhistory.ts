/**
 * STOCKHISTORY: Returns historical market data from a host-managed synchronous cache.
 * Example: =STOCKHISTORY("MSFT",DATE(2024,1,1))
 */
import { createInformationFunction } from './InformationRuntime';

export const STOCKHISTORY = createInformationFunction('STOCKHISTORY');
