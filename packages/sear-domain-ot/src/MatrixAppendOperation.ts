import { type MatrixOTOperation } from './MatrixOTOperation';

/** Appends a transformed component into a matrix operation list. */
export type MatrixAppendOperation<T> = (destination: MatrixOTOperation<T>[], operation: MatrixOTOperation<T>) => void;
