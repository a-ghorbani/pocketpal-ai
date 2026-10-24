import {Platform} from 'react-native';
import {runInAction} from 'mobx';
import DeviceInfo from 'react-native-device-info';

import {readDeviceMemory} from '../../services/asr';
import {TTS_ENGINE_RUNTIME_BYTES} from '../../services/tts';
import {voiceMemoryFit} from '../../services/voice';
import {
  asrStore,
  chatSessionStore,
  modelStore,
  ttsStore,
  voiceModeStore,
} from '../../store';

import * as RNFS from '@dr.pogodin/react-native-fs';

import {vtrace} from '../../utils/voiceTrace';
import {runVoiceCommand, voiceTraceDump} from '../voiceAutomation';

describe('runVoiceCommand', () => {
  const initialOS = Platform.OS;

  afterEach(() => {
    Platform.OS = initialOS;
  });

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

  it('unlock::plus clears the override so the Plus entitlement decides', async () => {
    await runVoiceCommand('unlock::on');
    await runVoiceCommand('unlock::plus');
    expect(voiceModeStore.unlockOverride).toBeNull();
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

  describe('setup', () => {
    afterEach(() => {
      runInAction(() => {
        asrStore.selectedTier = 'base';
        asrStore.downloadStates.small = 'not_installed';
      });
    });

    it.each([
      ['setup::complete', 'ready'],
      ['setup::incomplete', 'not_installed'],
    ])('%s sets the in-use whisper tier to %s', async (cmd, state) => {
      runInAction(() => {
        asrStore.selectedTier = 'small';
      });
      await runVoiceCommand(cmd);
      expect(asrStore.downloadStates.small).toBe(state);
    });
  });

  it.each([
    ['android', 'memory::tight', 'tight'],
    ['android', 'memory::wont-fit', 'wont_fit'],
    ['ios', 'memory::tight', 'tight'],
    ['ios', 'memory::wont-fit', 'wont_fit'],
  ] as const)(
    'on %s, %s sizes the chat model for that band',
    async (os, cmd, status) => {
      Platform.OS = os;
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
      await runVoiceCommand(cmd);

      const fit = voiceMemoryFit({
        memory: await readDeviceMemory(modelStore),
        chatBytes: modelStore.loadedModelBytes ?? 0,
        sttTier: asrStore.selectedTier,
        ttsBytes: TTS_ENGINE_RUNTIME_BYTES.supertonic,
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

  it('trace::dump publishes the trace and writes it to a file', async () => {
    Platform.OS = 'ios';
    await runVoiceCommand('trace::clear');
    vtrace('phase', {to: 'thinking'});

    await runVoiceCommand('trace::dump');

    expect(voiceTraceDump.get()).toMatch(/^\d+ phase to=thinking$/);
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/voice-trace\.txt$/),
      voiceTraceDump.get(),
      'utf8',
    );
  });

  it('trace::clear empties the trace and the published dump', async () => {
    vtrace('tap', {phase: 'listening'});
    await runVoiceCommand('trace::dump');
    expect(voiceTraceDump.get()).not.toBe('');

    await runVoiceCommand('trace::clear');
    await runVoiceCommand('trace::dump');

    expect(voiceTraceDump.get()).toBe('');
  });
});
