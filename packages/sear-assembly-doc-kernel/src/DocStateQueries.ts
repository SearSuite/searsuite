import { defineDocQuery } from '@searsuite/sear-assembly-commands';
import { type DocSelection } from '@searsuite/sear-domain-doc';
import { type DocDocumentState } from './DocKernelContracts';

/** Reads a detached committed document without native input or layout services. */
export const ReadDocDocumentQuery = defineDocQuery<void, DocDocumentState>('doc.readDocument');
/** Reads plain text from the committed document. */
export const ReadDocTextQuery = defineDocQuery<void, string>('doc.readText');
/** Reads detached document selection coordinates. */
export const ReadDocSelectionQuery = defineDocQuery<void, DocSelection>('doc.readSelection');
