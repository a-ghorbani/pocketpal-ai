import {bindingSource, BINDING_TIMEOUT_MS} from '../bindingSource';
import {iapApi} from '../iapApi';
import {authService} from '../../palshub/AuthService';

jest.mock('../../palshub/AuthService', () => ({
  authService: {isAuthenticated: true},
}));

describe('bindingSource', () => {
  let bindingSpy: jest.SpyInstance;

  beforeEach(() => {
    (authService as any).isAuthenticated = true;
    bindingSpy = jest.spyOn(iapApi, 'binding');
  });

  afterEach(() => {
    bindingSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns null without a request when signed out', async () => {
    (authService as any).isAuthenticated = false;
    await expect(bindingSource.getBinding()).resolves.toBeNull();
    expect(bindingSpy).not.toHaveBeenCalled();
  });

  it('returns the server binding when signed in', async () => {
    bindingSpy.mockResolvedValue({appAccountToken: 'uuid'});
    await expect(bindingSource.getBinding()).resolves.toEqual({
      appAccountToken: 'uuid',
    });
  });

  it('returns null on error', async () => {
    bindingSpy.mockRejectedValue(new Error('boom'));
    await expect(bindingSource.getBinding()).resolves.toBeNull();
  });

  it('returns null once the binding takes longer than the timeout', async () => {
    jest.useFakeTimers();
    bindingSpy.mockReturnValue(new Promise(() => {}));
    const pending = bindingSource.getBinding();
    jest.advanceTimersByTime(BINDING_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();
    expect(BINDING_TIMEOUT_MS).toBe(2000);
  });
});
