import {runInAction} from 'mobx';
import DeviceInfo from 'react-native-device-info';

import {ASR_TIERS} from '../../services/asr';
import {TTS_ENGINE_RUNTIME_BYTES} from '../../services/tts';
import {voiceMemoryFit} from '../../services/voice';
import {
  asrStore,
  chatSessionStore,
  modelStore,
  ttsStore,
  voiceModeStore,
} from '../../store';

import {runVoiceCommand} from '../voiceAutomation';

describe('runVoiceCommand', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    (voiceModeStore as any).reset();
    runInAction(() => {
      (ttsStore as any).currentVoice = {
        id: 'F1',
        name: 'F1',
        engine: 'supertonic',
      };
    });
  });

  it.each([
    ['unlock::on', true],
    ['unlock::off', false],
  ])('%s sets the unlock override', async (cmd, unlocked) => {
    await runVoiceCommand(cmd);
    expect(voiceModeStore.isUnlocked).toBe(unlocked);
  });

  it.each([
    ['gate::on', true],
    ['gate::off', false],
  ])('%s moves the device tier across the gate', async (cmd, supported) => {
    await runVoiceCommand(cmd);
    expect(voiceModeStore.supported).toBe(supported);
  });

  it.each([
    ['state::listening', {phase: 'listening', micMuted: false}],
    ['state::muted', {phase: 'listening', micMuted: true}],
    ['state::thinking', {phase: 'thinking'}],
    ['state::speaking', {phase: 'speaking'}],
    ['state::error', {phase: 'listening', lastError: 'reply_failed'}],
    ['state::bar', {phase: 'listening', presentation: 'bar'}],
    ['state::closed', {phase: 'closed'}],
  ])('%s forces the session state', async (cmd, expected) => {
    await runVoiceCommand(cmd);
    expect(voiceModeStore).toMatchObject(expected);
  });

  it.each([
    ['setup::complete', 'ready'],
    ['setup::incomplete', 'not_installed'],
  ])('%s sets whisper base to %s', async (cmd, state) => {
    await runVoiceCommand(cmd);
    expect(asrStore.downloadStates.base).toBe(state);
  });

  it.each([
    ['memory::tight', 'tight'],
    ['memory::wont-fit', 'wont_fit'],
  ])(
    '%s sizes the chat model for that band on Android',
    async (cmd, status) => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
      await runVoiceCommand(cmd);

      const fit = voiceMemoryFit({
        memory: {os: 'android', totalBytes: 8e9},
        chatBytes: modelStore.loadedModelBytes ?? 0,
        sttBytes: ASR_TIERS.base.runtimeBytes,
        ttsBytes: TTS_ENGINE_RUNTIME_BYTES.supertonic,
        ttsLoaded: false,
      });
      expect(fit.status).toBe(status);
    },
  );

  it('seed::spoken adds a spoken question and a spoken answer', async () => {
    await runVoiceCommand('seed::spoken');

    const rows = (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mock.calls.map(([row]) => row);
    expect(rows.map(row => [row.type, row.metadata.spoken])).toEqual([
      ['text', true],
      ['assistant_turn', true],
    ]);
  });
});
