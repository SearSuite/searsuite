/** Validates absolute HTTP(S) URL syntax without enforcing host-owned network access policy. */
export function isHttpWebServiceUrl(url: string): boolean {
  if (/[\s\u0000-\u001f\u007f]/.test(url) || !/^https?:\/\/[^/?#\\]/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}
