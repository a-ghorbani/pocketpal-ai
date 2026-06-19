import {Platform} from 'react-native';

import {getEngine, ttsRuntime} from '../services/tts';
import type {EngineId} from '../services/tts';
import {ttsStore} from '../store/TTSStore';

/**
 * E2E-only TTS driver. Lets the memory-profile harness download, synthesize
 * and release a neural engine without driving the setup-sheet UI, so RAM can
 * be sampled at loaded / active / idle checkpoints.
 *
 * Outcomes are written to a status file the spec polls — mirrors the
 * memory-snapshots file round-trip in `memoryProfile.ts`. The file is the
 * only awaitable signal because downloads (Supertonic ~380 MB) outlive any
 * single deep-link / TextInput round-trip.
 */

type NeuralEngineId = Exclude<EngineId, 'system'>;

const STATUS_FILENAME = 'tts-command-status.json';

const SAMPLE_TEXT =
  'PocketPal runs language models on your phone, fully offline.';

interface TtsStatus {
  cmd: string;
  state: 'running' | 'done' | 'error';
  detail?: string;
}

const statusFilePath = (): string => {
  const RNFS = require('@dr.pogodin/react-native-fs');
  const baseDir =
    Platform.OS === 'android'
      ? RNFS.ExternalDirectoryPath
      : RNFS.DocumentDirectoryPath;
  return `${baseDir}/${STATUS_FILENAME}`;
};

const writeStatus = async (status: TtsStatus): Promise<void> => {
  const RNFS = require('@dr.pogodin/react-native-fs');
  await RNFS.writeFile(statusFilePath(), JSON.stringify(status), 'utf8');
};

/** Read the latest command status JSON string (for the Android result round-trip). */
export async function readTtsStatus(): Promise<string> {
  const RNFS = require('@dr.pogodin/react-native-fs');
  const filePath = statusFilePath();
  if (await RNFS.exists(filePath)) {
    return await RNFS.readFile(filePath, 'utf8');
  }
  return '{}';
}

const downloadFor = (id: NeuralEngineId): (() => Promise<void>) => {
  if (id === 'kokoro') {
    return ttsStore.downloadKokoro;
  }
  if (id === 'supertonic') {
    return ttsStore.downloadSupertonic;
  }
  return ttsStore.downloadKitten;
};

const installedStateFor = (id: NeuralEngineId): boolean => {
  if (id === 'kokoro') {
    return ttsStore.kokoroDownloadState === 'ready';
  }
  if (id === 'supertonic') {
    return ttsStore.supertonicDownloadState === 'ready';
  }
  return ttsStore.kittenDownloadState === 'ready';
};

/** Download `engineId` (if not already installed) and leave it ready. */
async function downloadEngine(engineId: NeuralEngineId): Promise<void> {
  const engine = getEngine(engineId);
  if (!(await engine.isInstalled())) {
    await downloadFor(engineId)();
  }
  if (!installedStateFor(engineId) && !(await engine.isInstalled())) {
    throw new Error(`download did not leave ${engineId} ready`);
  }
}

/** Run one synthesis on `engineId`. Engines self-route through ttsRuntime. */
async function synthesize(engineId: NeuralEngineId): Promise<void> {
  const engine = getEngine(engineId);
  const voices = await engine.getVoices();
  const voice = voices[0];
  if (!voice) {
    throw new Error(`no voices for ${engineId}`);
  }
  await engine.play(SAMPLE_TEXT, voice);
}

/**
 * Dispatch a `pocketpal://tts?cmd=...` command. Supported:
 *   download::<engine>   synthesize::<engine>   release
 * Writes a status file the spec polls for completion.
 */
export async function runTtsCommand(cmd: string): Promise<void> {
  await writeStatus({cmd, state: 'running'});
  try {
    if (cmd.startsWith('download::')) {
      await downloadEngine(cmd.slice('download::'.length) as NeuralEngineId);
    } else if (cmd.startsWith('synthesize::')) {
      await synthesize(cmd.slice('synthesize::'.length) as NeuralEngineId);
    } else if (cmd === 'release') {
      await ttsRuntime.release();
    } else {
      throw new Error(`unknown tts cmd: ${cmd}`);
    }
    await writeStatus({cmd, state: 'done'});
  } catch (err) {
    await writeStatus({
      cmd,
      state: 'error',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
