import {Platform} from 'react-native';

import Speech from '@pocketpalai/react-native-speech';

import {getEngine, ttsRuntime} from '../services/tts';
import type {NeuralEngineId} from '../services/tts';
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

const STATUS_FILENAME = 'tts-command-status.json';

const SAMPLE_TEXT =
  'PocketPal runs language models on your phone, fully offline.';

const TIMING_RUNS = 3;

interface TimingRun {
  ttfaMs: number;
  audioMs: number;
  rtf: number;
  /** More than 1 means the sample played as several chunks. */
  starts: number;
}

interface TimingDetail {
  runs: TimingRun[];
  medianTtfaMs: number;
  medianRtf: number;
}

interface TtsStatus {
  cmd: string;
  state: 'running' | 'done' | 'error';
  detail?: string | TimingDetail;
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
  switch (id) {
    case 'kokoro':
      return ttsStore.downloadKokoro;
    case 'supertonic':
      return ttsStore.downloadSupertonic;
    case 'kitten':
      return ttsStore.downloadKitten;
    case 'phonon':
      return ttsStore.downloadPhonon;
    default: {
      const unhandled: never = id;
      throw new Error(`unknown tts engine: ${String(unhandled)}`);
    }
  }
};

const installedStateFor = (id: NeuralEngineId): boolean => {
  switch (id) {
    case 'kokoro':
      return ttsStore.kokoroDownloadState === 'ready';
    case 'supertonic':
      return ttsStore.supertonicDownloadState === 'ready';
    case 'kitten':
      return ttsStore.kittenDownloadState === 'ready';
    case 'phonon':
      return ttsStore.phononDownloadState === 'ready';
    default: {
      const unhandled: never = id;
      throw new Error(`unknown tts engine: ${String(unhandled)}`);
    }
  }
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

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * One timed utterance. The sample is a single chunk, so synthesis time is
 * about the time to first audio, and the audio lasts from the first onStart
 * to the last onFinish (or to `speak` resolving when no onFinish arrives).
 */
async function timeOneRun(engineId: NeuralEngineId, voiceId: string) {
  const engine = getEngine(engineId);
  let starts = 0;
  let firstStartAt: number | null = null;
  let lastFinishAt: number | null = null;
  const startSub = Speech.onStart(() => {
    starts++;
    firstStartAt ??= Date.now();
  });
  const finishSub = Speech.onFinish(() => {
    lastFinishAt = Date.now();
  });
  const t0 = Date.now();
  try {
    await ttsRuntime.acquire(engine, () => Speech.speak(SAMPLE_TEXT, voiceId));
  } finally {
    startSub.remove();
    finishSub.remove();
  }
  const resolvedAt = Date.now();
  if (firstStartAt === null) {
    throw new Error(`no onStart from ${engineId}`);
  }
  const ttfaMs = firstStartAt - t0;
  const audioMs = (lastFinishAt ?? resolvedAt) - firstStartAt;
  return {ttfaMs, audioMs, rtf: ttfaMs / audioMs, starts};
}

/** Time to first audio and real-time factor, the median of 3 warm runs. */
async function timeEngine(engineId: NeuralEngineId): Promise<TimingDetail> {
  const engine = getEngine(engineId);
  const voice = (await engine.getVoices())[0];
  if (!voice) {
    throw new Error(`no voices for ${engineId}`);
  }
  await ttsRuntime.acquire(engine, async () => {});
  const runs: TimingRun[] = [];
  for (let i = 0; i < TIMING_RUNS; i++) {
    runs.push(await timeOneRun(engineId, voice.id));
  }
  return {
    runs,
    medianTtfaMs: median(runs.map(r => r.ttfaMs)),
    medianRtf: median(runs.map(r => r.rtf)),
  };
}

/**
 * Dispatch a `pocketpal://tts?cmd=...` command. Supported:
 *   download::<engine>   synthesize::<engine>   time::<engine>   release
 * Writes a status file the spec polls for completion.
 */
export async function runTtsCommand(cmd: string): Promise<void> {
  await writeStatus({cmd, state: 'running'});
  try {
    if (cmd.startsWith('download::')) {
      await downloadEngine(cmd.slice('download::'.length) as NeuralEngineId);
    } else if (cmd.startsWith('synthesize::')) {
      await synthesize(cmd.slice('synthesize::'.length) as NeuralEngineId);
    } else if (cmd.startsWith('time::')) {
      const detail = await timeEngine(
        cmd.slice('time::'.length) as NeuralEngineId,
      );
      await writeStatus({cmd, state: 'done', detail});
      return;
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
