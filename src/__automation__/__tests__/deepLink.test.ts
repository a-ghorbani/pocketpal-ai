import {dispatchAutomationDeepLink} from '../deepLink';

import type {DeepLinkParams} from '../../services/DeepLinkService';

import {
  takeMemorySnapshot,
  clearMemorySnapshots,
} from '../../utils/memoryProfile';

jest.mock('../../utils/memoryProfile', () => ({
  takeMemorySnapshot: jest.fn().mockResolvedValue(undefined),
  clearMemorySnapshots: jest.fn().mockResolvedValue(undefined),
  readMemorySnapshots: jest.fn().mockResolvedValue(''),
}));

// Helper: every DeepLinkParams has url+scheme+host at minimum; tests only
// care about host + queryParams so we fill the rest with placeholders.
const makeParams = (overrides: Partial<DeepLinkParams>): DeepLinkParams => ({
  url: 'pocketpal://placeholder',
  scheme: 'pocketpal',
  host: 'memory',
  ...overrides,
});

describe('dispatchAutomationDeepLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('takes a memory snapshot for host=memory + cmd=snap::<label>', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'memory', queryParams: {cmd: 'snap::model_loaded'}}),
    );

    expect(handled).toBe(true);
    expect(takeMemorySnapshot).toHaveBeenCalledWith('model_loaded');
    expect(clearMemorySnapshots).not.toHaveBeenCalled();
  });

  it('defaults to "unnamed" when snap:: has no label', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'memory', queryParams: {cmd: 'snap::'}}),
    );

    expect(handled).toBe(true);
    expect(takeMemorySnapshot).toHaveBeenCalledWith('unnamed');
  });

  it('clears snapshots for host=memory + cmd=clear::snapshots', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'memory', queryParams: {cmd: 'clear::snapshots'}}),
    );

    expect(handled).toBe(true);
    expect(clearMemorySnapshots).toHaveBeenCalled();
    expect(takeMemorySnapshot).not.toHaveBeenCalled();
  });

  it('returns true but ignores unrecognized cmd under host=memory', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'memory', queryParams: {cmd: 'unknown::command'}}),
    );

    // Contract: host=memory is "handled" so the caller does not fall through
    // to chat-routing, even if the specific cmd is a no-op.
    expect(handled).toBe(true);
    expect(takeMemorySnapshot).not.toHaveBeenCalled();
    expect(clearMemorySnapshots).not.toHaveBeenCalled();
  });

  it('returns false when host is not memory', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'chat', queryParams: {palId: 'pal-1'}}),
    );

    expect(handled).toBe(false);
    expect(takeMemorySnapshot).not.toHaveBeenCalled();
    expect(clearMemorySnapshots).not.toHaveBeenCalled();
  });

  it('returns false when host=memory but no cmd is provided', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'memory', queryParams: {}}),
    );

    expect(handled).toBe(false);
    expect(takeMemorySnapshot).not.toHaveBeenCalled();
    expect(clearMemorySnapshots).not.toHaveBeenCalled();
  });

  it('returns false when host=memory but queryParams is absent', async () => {
    const handled = await dispatchAutomationDeepLink(
      makeParams({host: 'memory'}),
    );

    expect(handled).toBe(false);
    expect(takeMemorySnapshot).not.toHaveBeenCalled();
    expect(clearMemorySnapshots).not.toHaveBeenCalled();
  });

  describe('bench host', () => {
    it('navigates to BenchmarkRunner for pocketpal://e2e/benchmark', async () => {
      const navigate = jest.fn();
      const handled = await dispatchAutomationDeepLink(
        makeParams({
          url: 'pocketpal://e2e/benchmark',
          host: 'e2e',
        }),
        {navigate},
      );

      expect(handled).toBe(true);
      expect(navigate).toHaveBeenCalledWith('BenchmarkRunner');
    });

    it('returns true even when no navigation is supplied (cold-launch path handles nav itself)', async () => {
      const handled = await dispatchAutomationDeepLink(
        makeParams({
          url: 'pocketpal://e2e/benchmark',
          host: 'e2e',
        }),
      );
      expect(handled).toBe(true);
    });

    it('returns false when host=e2e but the URL does not include /benchmark', async () => {
      const navigate = jest.fn();
      const handled = await dispatchAutomationDeepLink(
        makeParams({
          url: 'pocketpal://e2e/other',
          host: 'e2e',
        }),
        {navigate},
      );

      expect(handled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
