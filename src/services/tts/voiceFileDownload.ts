import * as RNFS from '@dr.pogodin/react-native-fs';

import {ttsRuntime} from './runtime';
import type {Voice, VoiceFileSource} from './types';

const inFlight = new Map<string, Promise<boolean>>();

/**
 * Make sure `voice`'s file is at `file.path`, downloading it when absent.
 * Resolves `false` on any failure; never rejects. A file at `file.path`
 * is always complete: the download lands in `<path>.part` and is moved
 * into place only after HTTP 200.
 */
export const ensureVoiceFileAt = (
  voice: Voice,
  file: VoiceFileSource,
): Promise<boolean> => {
  const key = `${voice.engine}:${voice.id}`;
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }
  const run = fetchIfMissing(voice, file).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
};

const fetchIfMissing = async (
  voice: Voice,
  {path, url}: VoiceFileSource,
): Promise<boolean> => {
  const partPath = `${path}.part`;
  try {
    if (await RNFS.exists(path)) {
      return true;
    }
    await RNFS.mkdir(path.slice(0, path.lastIndexOf('/')), {
      NSURLIsExcludedFromBackupKey: true,
    });
    let resumable = () => {};
    const resumed = new Promise<null>(resolve => {
      resumable = () => resolve(null);
    });
    const result = await Promise.race([
      RNFS.downloadFile({
        fromUrl: url,
        toFile: partPath,
        background: false,
        discretionary: false,
        cacheable: false,
        progressInterval: 1000,
        resumable,
      }).promise,
      resumed,
    ]);
    if (!result) {
      await RNFS.unlink(partPath).catch(() => {});
      console.warn(
        `[tts] voice ${voice.engine}:${voice.id} download failed: interrupted`,
      );
      return false;
    }
    const {statusCode} = result;
    if (statusCode !== 200) {
      await RNFS.unlink(partPath).catch(() => {});
      console.warn(
        `[tts] voice ${voice.engine}:${voice.id} download failed: HTTP ${statusCode}`,
      );
      return false;
    }
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
    await RNFS.moveFile(partPath, path);
    if (voice.engine === 'supertonic') {
      ttsRuntime.invalidate('supertonic');
    }
    return true;
  } catch (err) {
    console.warn(
      `[tts] voice ${voice.engine}:${voice.id} download failed:`,
      err,
    );
    return false;
  }
};
