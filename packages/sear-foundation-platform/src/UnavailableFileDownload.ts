import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { FileDownload, type FileDownloadRequest } from './FileDownload';

/** Explicit fallback for hosts that do not provide file saving. */
@Injectable()
export class UnavailableFileDownload extends FileDownload {
  public download(_request: FileDownloadRequest): void {
    throw new SearError('File download is unavailable in this host', { code: 'FILE_DOWNLOAD_UNAVAILABLE' });
  }
  public destroy(): void {}
}
