const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function validHostname(hostname: string, requireDot: boolean): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false;
  const labels = hostname.split('.');
  return (!requireDot || labels.length > 1) && labels.every((label) => hostnameLabel.test(label));
}
