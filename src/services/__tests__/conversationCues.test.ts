import NativeSpeechRecognition from '../../specs/NativeSpeechRecognition';
import {cancelConversationCue, playConversationCue} from '../conversationCues';

jest.mock('../../specs/NativeSpeechRecognition', () => ({
  __esModule: true,
  default: {
    playTurnCue: jest.fn(),
    cancelTurnCue: jest.fn(),
  },
}));

const native = NativeSpeechRecognition as jest.Mocked<
  NonNullable<typeof NativeSpeechRecognition>
>;

describe('conversationCues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    native.playTurnCue.mockResolvedValue(true);
    native.cancelTurnCue.mockResolvedValue(undefined);
  });

  it('awaits native playback instead of resolving at dispatch', async () => {
    let finish: (played: boolean) => void = () => {};
    native.playTurnCue.mockImplementationOnce(
      () => new Promise(resolve => (finish = resolve)),
    );
    let completed = false;
    const cue = playConversationCue('narrationEnded').then(() => {
      completed = true;
    });
    expect(native.playTurnCue).toHaveBeenCalledWith('narrationEnded');
    expect(completed).toBe(false);
    finish(true);
    await cue;
    expect(completed).toBe(true);
  });

  it('propagates playback failures rather than reporting a successful cue', async () => {
    native.playTurnCue.mockRejectedValueOnce(new Error('native playback'));
    await expect(playConversationCue('listeningEnded')).rejects.toThrow(
      'native playback',
    );
  });

  it('cancels an in-flight cue', () => {
    cancelConversationCue();
    expect(native.cancelTurnCue).toHaveBeenCalledTimes(1);
  });
});
