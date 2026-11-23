/**
 * Injectable timing, events, view geometry, identifiers, and host diagnostics.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 platform-contract Supply an environment through Platform
 * @referenceBody
 * `Platform` is the injected contract for timing, events, view offsets, identifiers, and diagnostics. Reusable
 * packages depend on this contract so the same editor state and command logic can run in different hosts.
 * Browser and Node packages provide concrete implementations for their respective environments.
 *
 * **Use when:** assembling an editor for a host or implementing a new host adapter. Supply one Platform instance to
 * the editor-local composition root. Event listeners and timers acquired through it must be released when the editor
 * is destroyed; a child editor must not dispose services borrowed from its parent.
 */

/**
 * @referenceChapter 1 optional-services Keep host effects at the boundary
 * @referenceBody
 * File downloads, web requests, and XML evaluation are separate capabilities with abstract contracts and concrete
 * Web or headless implementations. A feature receives the capability it needs; it does not read browser globals or
 * choose the application's credentials, transport, and file-saving policy.
 *
 * `FileDownload` illustrates the relationship: an export feature prepares data, while the host-provided adapter
 * decides how a file is saved. A headless host can use an unavailable implementation when saving is intentionally
 * unsupported. The document state does not change merely because a host performs this effect.
 */

export { Platform } from './Platform';
export {
  PlatformEventName,
  type PlatformEventListenerOptions,
  type PlatformFrameRequestCallback,
  type PlatformViewOffset,
} from './Platform';
export { XmlDocumentParser } from './XmlDocumentParser';
export { XmlXPathEngine } from './XmlXPathEngine';
export { UnavailableXmlDocumentParser } from './UnavailableXmlDocumentParser';
export { UnavailableXmlXPathEngine } from './UnavailableXmlXPathEngine';
export { WebServiceClient } from './WebServiceClient';
export { UnavailableWebServiceClient } from './UnavailableWebServiceClient';
export { isHttpWebServiceUrl } from './WebServiceUrl';
export { WebServiceError, WebServiceErrorCode } from './WebServiceError';
export { type WebServiceCancellation, type WebServiceRequestOptions, type WebServiceResponse } from './WebServiceTypes';
export { XmlXPathEvaluator } from './XmlXPathEvaluator';
export { XmlXPathError, XmlXPathErrorCode } from './XmlXPathError';
export { type XmlXPathEvaluation, type XmlXPathOptions } from './XmlXPathTypes';
export { FileDownload, type FileDownloadRequest } from './FileDownload';

export { UnavailableFileDownload } from './UnavailableFileDownload';
