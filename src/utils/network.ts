import axios from 'axios';

/**
 * Checks if the device has internet connectivity
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to boolean indicating connectivity status
 */
export const checkConnectivity = async (timeoutMs = 5000): Promise<boolean> => {
  try {
    // Try to fetch a small amount of data from a reliable endpoint
    await axios.head('https://www.google.com', {timeout: timeoutMs});
    return true;
  } catch (error) {
    console.error('Connectibity Error: ', error);
    return false;
  }
};

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
