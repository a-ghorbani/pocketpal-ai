const mockStart = jest.fn();
const mockStop = jest.fn();
let mockNative: {start: jest.Mock; stop: jest.Mock} | null = null;

jest.mock('../../../specs/NativeSpeechPlayback', () => ({
  __esModule: true,
  get default() {
    return mockNative;
  },
}));

import {NativeEventEmitter} from 'react-native';

import {
  holdSpeechService,
  onSpeechServiceStop,
  releaseSpeechService,
} from '../speechService';

const mockRemove = jest.fn();
const mockAddListener = NativeEventEmitter.prototype.addListener as jest.Mock;

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
    mockAddListener.mockReturnValue({remove: mockRemove});
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

  it('subscribes to the Stop event and unsubscribes', () => {
    const listener = jest.fn();

    const unsubscribe = onSpeechServiceStop(listener);
    expect(mockAddListener).toHaveBeenCalledWith(
      'speechPlaybackStop',
      listener,
    );

    unsubscribe();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the module does not exist (iOS)', async () => {
    mockNative = null;

    await holdSpeechService(COPY);
    releaseSpeechService();
    onSpeechServiceStop(jest.fn())();

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockAddListener).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
