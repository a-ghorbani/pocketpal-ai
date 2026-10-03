import {checkConnectivity} from '../network';

describe('network utilities', () => {
  describe('checkConnectivity', () => {
    it.each([undefined, 1000])(
      'does not issue a centralized connectivity probe for timeout %s',
      async timeout => {
        const fetchSpy = jest.spyOn(global, 'fetch');

        await expect(checkConnectivity(timeout)).resolves.toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();

        fetchSpy.mockRestore();
      },
    );
  });
});
