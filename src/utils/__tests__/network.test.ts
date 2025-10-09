import axios from 'axios';
import {checkConnectivity} from '../network';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('network utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConnectivity', () => {
    it('should return true when network is available', async () => {
      mockedAxios.head.mockResolvedValueOnce({status: 200});

      const result = await checkConnectivity();

      expect(result).toBe(true);
      expect(mockedAxios.head).toHaveBeenCalledWith('https://www.google.com', {
        timeout: 5000,
      });
    });

    it('should return false when network is unavailable', async () => {
      mockedAxios.head.mockRejectedValueOnce(new Error('Network error'));

      const result = await checkConnectivity();

      expect(result).toBe(false);
    });

    it('should use custom timeout when provided', async () => {
      mockedAxios.head.mockResolvedValueOnce({status: 200});

      await checkConnectivity(3000);

      expect(mockedAxios.head).toHaveBeenCalledWith('https://www.google.com', {
        timeout: 3000,
      });
    });

    it('should return false on timeout', async () => {
      mockedAxios.head.mockRejectedValueOnce({code: 'ECONNABORTED'});

      const result = await checkConnectivity(1000);

      expect(result).toBe(false);
    });
  });
});
