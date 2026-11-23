/** Host-neutral request to save an in-memory file. */
export interface FileDownloadRequest {
  /** Suggested file name. */ readonly name: string;
  /** File media type. */ readonly mediaType: string;
  /** Text or binary file contents. */ readonly data: string | Uint8Array;
}
/** Replaceable host capability for saving generated files. */
export abstract class FileDownload {
  /** Token for host composition roots that register the capability through DI. */
  public static readonly symbol = Symbol.for('FileDownload');
  /** Initiates one host file save. */ abstract download(request: FileDownloadRequest): void;
  /** Releases pending host resources, idempotently. */ abstract destroy(): void;
}
