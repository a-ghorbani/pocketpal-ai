/**
 * Centralized integrations are disabled in this build. Retained callers
 * perform their own request and error handling.
 */
export const checkConnectivity = async (_timeoutMs = 5000): Promise<boolean> =>
  true;

/**
 * Returns true if the host is a local/LAN address.
 */
export function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}
