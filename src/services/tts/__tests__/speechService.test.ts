const mockStart = jest.fn();
const mockStop = jest.fn();
let mockNative: {start: jest.Mock; stop: jest.Mock} | null = null;

jest.mock('../../../specs/NativeSpeechPlayback', () => ({
  __esModule: true,
  get default() {
    return mockNative;
  },
}));

import {holdSpeechService, releaseSpeechService} from '../speechService';

const COPY = {
  title: 'PocketPal is speaking',
  stopLabel: 'Stop',
  channelName: 'Speech',
};

describe('speechService', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNative = {start: mockStart, stop: mockStop};
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('starts the native service with the copy', async () => {
    mockStart.mockResolvedValueOnce(undefined);

    await holdSpeechService(COPY);

    expect(mockStart).toHaveBeenCalledWith(COPY);
    expect(warn).not.toHaveBeenCalled();
  });

  it('swallows a refused start and warns once', async () => {
    const refused = new Error('ForegroundServiceStartNotAllowedException');
    mockStart.mockRejectedValueOnce(refused);

    await expect(holdSpeechService(COPY)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[tts] speech service start failed:',
      refused,
    );
  });

  it('stops the native service', () => {
    releaseSpeechService();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the module does not exist (iOS)', async () => {
    mockNative = null;

    await holdSpeechService(COPY);
    releaseSpeechService();

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });
});
