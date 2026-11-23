import { currentExcelDateTimeSerial } from '../shared/dateTimeUtils';
import { makeDateFunction } from '../shared/dateTimeFunctionUtils';

/**
 * NOW: Returns the current date and time as an Excel serial.
 * Example: =NOW()-0.5 returns the serial for 12 hours before the injected clock time.
 */
export const NOW = makeDateFunction('NOW', 0, 0, (_args, context) => currentExcelDateTimeSerial(context), true);
