#!/usr/bin/env npx tsx

/**
 * TTS Audio Analyzer
 *
 * Host-side analyzer for synthesized speech WAVs. Parses a PCM WAV, computes
 * energy/silence statistics, and emits a pass/fail verdict against TTS-shaped
 * thresholds. Optionally runs a whisper-cli ASR sanity check when available.
 *
 * Intended flow (synthesis half is pending a library API):
 *   synthesizeToFile is provided by @pocketpalai/react-native-speech (pending);
 *   once it lands, the e2e calls it per engine x language, pulls each WAV off the
 *   device via adb pull / simctl, then runs this analyzer on the pulled files.
 *   This script is the reusable host-side half and has no dependency on the app
 *   or the device — it only reads WAV files on disk.
 *
 * Usage:
 *   npx tsx scripts/analyze-tts-audio.ts <file-or-dir-or-glob> [...more]
 *   npx tsx scripts/analyze-tts-audio.ts out.wav --min-duration 0.5 --max-silence-ratio 0.85
 *   npx tsx scripts/analyze-tts-audio.ts "reports/*.wav" --output verdicts.json
 *   npx tsx scripts/analyze-tts-audio.ts out.wav --asr --asr-lang ja \
 *     --whisper-model /path/to/ggml-base.bin --expect-keyword こんにちは
 *
 * Exit codes:
 *   0 = pass (all analyzed files pass)
 *   1 = fail (one or more files fail)
 *   2 = error (bad input, missing files, unparsable WAV, etc.)
 */

import {execFileSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface WavData {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  /** Mono PCM samples normalized to [-1, 1], averaged across channels. */
  samples: Float32Array;
}

export interface AsrResult {
  available: boolean;
  text?: string;
  detectedLang?: string;
  expectedLang?: string;
  langMatch?: boolean;
  keyword?: string;
  keywordFound?: boolean;
  note?: string;
}

export interface Thresholds {
  /** Minimum acceptable duration in seconds. */
  minDuration: number;
  /** Maximum acceptable duration in seconds (0 disables the upper bound). */
  maxDuration: number;
  /** Maximum fraction of frames allowed below the silence floor. */
  maxSilenceRatio: number;
  /** Minimum overall RMS in dBFS (e.g. -50 means "louder than -50 dBFS"). */
  minRmsDbfs: number;
  /** Amplitude (0..1) below which a frame counts as silent. */
  silenceFloor: number;
}

export interface Verdict {
  file: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  rms: number;
  rmsDbfs: number;
  peak: number;
  silenceRatio: number;
  leadingSilenceSec: number;
  trailingSilenceSec: number;
  hasSpeechLikeEnergy: boolean;
  pass: boolean;
  reasons: string[];
  asr?: AsrResult;
}

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  pass: boolean;
  verdicts: Verdict[];
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minDuration: 0.3,
  maxDuration: 0,
  maxSilenceRatio: 0.9,
  minRmsDbfs: -50,
  silenceFloor: 0.01,
};

const NEG_INFINITY_DBFS = -Infinity;

function readUInt32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

function readUInt16LE(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

/**
 * Hand-parse a canonical PCM/IEEE-float RIFF WAV. Walks the chunk list so it
 * tolerates extra chunks (LIST/fact/etc.) between `fmt ` and `data`.
 */
export function parseWav(buf: Buffer): WavData {
  if (buf.length < 12) {
    throw new Error('file too small to be a WAV');
  }
  if (buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('missing RIFF header');
  }
  if (buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a WAVE file');
  }

  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitDepth = 0;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = readUInt32LE(buf, offset + 4);
    const bodyStart = offset + 8;

    if (chunkId === 'fmt ') {
      audioFormat = readUInt16LE(buf, bodyStart);
      channels = readUInt16LE(buf, bodyStart + 2);
      sampleRate = readUInt32LE(buf, bodyStart + 4);
      bitDepth = readUInt16LE(buf, bodyStart + 14);
    } else if (chunkId === 'data') {
      dataOffset = bodyStart;
      dataLength = Math.min(chunkSize, buf.length - bodyStart);
    }

    // Chunks are word-aligned: odd sizes are padded with a trailing byte.
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (sampleRate === 0 || channels === 0 || bitDepth === 0) {
    throw new Error('missing or invalid fmt chunk');
  }
  if (dataOffset < 0) {
    throw new Error('missing data chunk');
  }

  // audioFormat: 1 = PCM, 3 = IEEE float, 0xFFFE = extensible (assume PCM here).
  const isFloat = audioFormat === 3;
  if (audioFormat !== 1 && audioFormat !== 3 && audioFormat !== 0xfffe) {
    throw new Error(`unsupported WAV audio format: ${audioFormat}`);
  }
  if (isFloat && bitDepth !== 32) {
    throw new Error(`unsupported float bit depth: ${bitDepth}`);
  }
  if (!isFloat && bitDepth !== 16 && bitDepth !== 8 && bitDepth !== 32) {
    throw new Error(`unsupported PCM bit depth: ${bitDepth}`);
  }

  const bytesPerSample = bitDepth / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    let acc = 0;
    for (let ch = 0; ch < channels; ch++) {
      const sampleOffset =
        dataOffset + (frame * channels + ch) * bytesPerSample;
      let value: number;
      if (isFloat) {
        value = buf.readFloatLE(sampleOffset);
      } else if (bitDepth === 16) {
        value = buf.readInt16LE(sampleOffset) / 32768;
      } else if (bitDepth === 32) {
        value = buf.readInt32LE(sampleOffset) / 2147483648;
      } else {
        // 8-bit PCM is unsigned, centered at 128.
        value = (buf.readUInt8(sampleOffset) - 128) / 128;
      }
      acc += value;
    }
    samples[frame] = acc / channels;
  }

  return {sampleRate, bitDepth, channels, samples};
}

function amplitudeToDbfs(amplitude: number): number {
  if (amplitude <= 0) {
    return NEG_INFINITY_DBFS;
  }
  return 20 * Math.log10(amplitude);
}

export interface AudioStats {
  rms: number;
  rmsDbfs: number;
  peak: number;
  silenceRatio: number;
  leadingSilenceSec: number;
  trailingSilenceSec: number;
}

/**
 * Per-sample silence detection. Cheap and deterministic; good enough to tell a
 * silent or near-silent clip from one carrying speech energy.
 */
export function computeStats(wav: WavData, silenceFloor: number): AudioStats {
  const {samples, sampleRate} = wav;
  const n = samples.length;

  if (n === 0) {
    return {
      rms: 0,
      rmsDbfs: NEG_INFINITY_DBFS,
      peak: 0,
      silenceRatio: 1,
      leadingSilenceSec: 0,
      trailingSilenceSec: 0,
    };
  }

  let sumSquares = 0;
  let peak = 0;
  let silentFrames = 0;
  let firstLoud = -1;
  let lastLoud = -1;

  for (let i = 0; i < n; i++) {
    const abs = Math.abs(samples[i]);
    sumSquares += samples[i] * samples[i];
    if (abs > peak) {
      peak = abs;
    }
    if (abs < silenceFloor) {
      silentFrames++;
    } else {
      if (firstLoud < 0) {
        firstLoud = i;
      }
      lastLoud = i;
    }
  }

  const rms = Math.sqrt(sumSquares / n);
  const silenceRatio = silentFrames / n;
  const leadingSilenceSec = firstLoud < 0 ? n / sampleRate : firstLoud / sampleRate;
  const trailingSilenceSec =
    lastLoud < 0 ? n / sampleRate : (n - 1 - lastLoud) / sampleRate;

  return {
    rms,
    rmsDbfs: amplitudeToDbfs(rms),
    peak,
    silenceRatio,
    leadingSilenceSec,
    trailingSilenceSec,
  };
}

function resolveWhisperModel(explicit?: string): string | undefined {
  if (explicit) {
    return fs.existsSync(explicit) ? explicit : undefined;
  }
  const fromEnv = process.env.WHISPER_MODEL;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  return undefined;
}

/**
 * Optional ASR sanity hook. Requires whisper-cli on PATH AND a resolvable model
 * (via --whisper-model or WHISPER_MODEL). Never throws — returns
 * `available: false` with a note when it cannot run.
 */
export function runAsr(
  file: string,
  opts: {expectLang?: string; keyword?: string; model?: string},
): AsrResult {
  let binary: string;
  try {
    binary = execFileSync('command', ['-v', 'whisper-cli'], {
      shell: '/bin/sh',
      encoding: 'utf8',
    }).trim();
  } catch {
    return {available: false, note: 'whisper-cli not on PATH; ASR skipped'};
  }
  if (!binary) {
    return {available: false, note: 'whisper-cli not on PATH; ASR skipped'};
  }

  const model = resolveWhisperModel(opts.model);
  if (!model) {
    return {
      available: false,
      note: 'no whisper model resolved (--whisper-model or WHISPER_MODEL); ASR skipped',
    };
  }

  const lang = opts.expectLang ?? 'auto';
  let raw: string;
  try {
    // -np prints only the transcript segments to stdout; stderr carries logs.
    raw = execFileSync('whisper-cli', ['-m', model, '-l', lang, '-np', '-nf', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return {available: false, note: `whisper-cli failed: ${(e as Error).message}`};
  }

  // whisper-cli emits "[start --> end]  text" lines; keep just the text.
  const text = raw
    .split('\n')
    .map(line => line.replace(/^\s*\[[^\]]*\]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  const keyword = opts.keyword;
  const keywordFound = keyword
    ? text.toLowerCase().includes(keyword.toLowerCase())
    : undefined;

  return {
    available: true,
    text,
    expectedLang: opts.expectLang,
    langMatch: opts.expectLang ? text.length > 0 : undefined,
    keyword,
    keywordFound,
  };
}

export interface AnalyzeOptions {
  thresholds?: Partial<Thresholds>;
  asr?: boolean;
  asrLang?: string;
  keyword?: string;
  whisperModel?: string;
}

export function analyzeFile(file: string, opts: AnalyzeOptions = {}): Verdict {
  const thresholds: Thresholds = {...DEFAULT_THRESHOLDS, ...opts.thresholds};
  const buf = fs.readFileSync(file);
  const wav = parseWav(buf);
  const durationSec = wav.samples.length / wav.sampleRate;
  const stats = computeStats(wav, thresholds.silenceFloor);

  const reasons: string[] = [];

  if (durationSec < thresholds.minDuration) {
    reasons.push(
      `duration ${durationSec.toFixed(2)}s below minimum ${thresholds.minDuration}s`,
    );
  }
  if (thresholds.maxDuration > 0 && durationSec > thresholds.maxDuration) {
    reasons.push(
      `duration ${durationSec.toFixed(2)}s above maximum ${thresholds.maxDuration}s`,
    );
  }
  if (stats.silenceRatio > thresholds.maxSilenceRatio) {
    reasons.push(
      `silence ratio ${stats.silenceRatio.toFixed(3)} above maximum ${thresholds.maxSilenceRatio}`,
    );
  }
  if (stats.rmsDbfs < thresholds.minRmsDbfs) {
    const shown = stats.rmsDbfs === NEG_INFINITY_DBFS ? '-inf' : stats.rmsDbfs.toFixed(1);
    reasons.push(`RMS ${shown} dBFS below minimum ${thresholds.minRmsDbfs} dBFS`);
  }

  const hasSpeechLikeEnergy =
    stats.rmsDbfs >= thresholds.minRmsDbfs &&
    stats.silenceRatio <= thresholds.maxSilenceRatio &&
    stats.peak > thresholds.silenceFloor;

  let asr: AsrResult | undefined;
  if (opts.asr) {
    asr = runAsr(file, {
      expectLang: opts.asrLang,
      keyword: opts.keyword,
      model: opts.whisperModel,
    });
    if (asr.available && asr.keyword && asr.keywordFound === false) {
      reasons.push(`expected keyword "${asr.keyword}" not found in transcript`);
    }
  }

  return {
    file,
    durationSec: round(durationSec, 3),
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    bitDepth: wav.bitDepth,
    rms: round(stats.rms, 6),
    rmsDbfs: stats.rmsDbfs === NEG_INFINITY_DBFS ? NEG_INFINITY_DBFS : round(stats.rmsDbfs, 2),
    peak: round(stats.peak, 6),
    silenceRatio: round(stats.silenceRatio, 4),
    leadingSilenceSec: round(stats.leadingSilenceSec, 3),
    trailingSilenceSec: round(stats.trailingSilenceSec, 3),
    hasSpeechLikeEnergy,
    pass: reasons.length === 0,
    reasons,
    asr,
  };
}

function round(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

/** Resolve a positional arg into concrete WAV paths (file, directory, or *.wav glob). */
export function resolveInputs(input: string): string[] {
  // Directory: take every .wav inside (non-recursive).
  if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
    return fs
      .readdirSync(input)
      .filter(f => f.toLowerCase().endsWith('.wav'))
      .map(f => path.join(input, f))
      .sort();
  }
  // Simple `dir/*.wav` style glob (single directory, `*` wildcard only).
  if (input.includes('*')) {
    const dir = path.dirname(input);
    const pattern = path.basename(input);
    if (!fs.existsSync(dir)) {
      return [];
    }
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    return fs
      .readdirSync(dir)
      .filter(f => regex.test(f))
      .map(f => path.join(dir, f))
      .sort();
  }
  // Plain file path.
  return [input];
}

export function analyzeAll(files: string[], opts: AnalyzeOptions = {}): Summary {
  const verdicts = files.map(f => analyzeFile(f, opts));
  const passed = verdicts.filter(v => v.pass).length;
  return {
    total: verdicts.length,
    passed,
    failed: verdicts.length - passed,
    pass: verdicts.length > 0 && passed === verdicts.length,
    verdicts,
  };
}

interface ParsedArgs {
  inputs: string[];
  thresholds: Partial<Thresholds>;
  output?: string;
  asr: boolean;
  asrLang?: string;
  keyword?: string;
  whisperModel?: string;
}

const USAGE =
  'Usage: analyze-tts-audio.ts <file|dir|glob> [...] ' +
  '[--min-duration S] [--max-duration S] [--max-silence-ratio R] ' +
  '[--min-rms-dbfs D] [--silence-floor A] [--output path] ' +
  '[--asr] [--asr-lang LANG] [--expect-keyword WORD] [--whisper-model PATH]';

function parseArgs(argv: string[]): ParsedArgs {
  const inputs: string[] = [];
  const thresholds: Partial<Thresholds> = {};
  let output: string | undefined;
  let asr = false;
  let asrLang: string | undefined;
  let keyword: string | undefined;
  let whisperModel: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) {
        throw new Error(`missing value for ${arg}`);
      }
      return v;
    };
    switch (arg) {
      case '--min-duration':
        thresholds.minDuration = Number(next());
        break;
      case '--max-duration':
        thresholds.maxDuration = Number(next());
        break;
      case '--max-silence-ratio':
        thresholds.maxSilenceRatio = Number(next());
        break;
      case '--min-rms-dbfs':
        thresholds.minRmsDbfs = Number(next());
        break;
      case '--silence-floor':
        thresholds.silenceFloor = Number(next());
        break;
      case '--output':
        output = next();
        break;
      case '--asr':
        asr = true;
        break;
      case '--asr-lang':
        asrLang = next();
        break;
      case '--expect-keyword':
        keyword = next();
        break;
      case '--whisper-model':
        whisperModel = next();
        break;
      case '--help':
      case '-h':
        console.error(USAGE);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`unknown flag: ${arg}`);
        }
        inputs.push(arg);
    }
  }

  return {inputs, thresholds, output, asr, asrLang, keyword, whisperModel};
}

function main(): void {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    console.error(USAGE);
    process.exit(2);
  }

  if (parsed.inputs.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const files: string[] = [];
  for (const input of parsed.inputs) {
    files.push(...resolveInputs(input));
  }

  if (files.length === 0) {
    console.error('No WAV files matched the given inputs.');
    process.exit(2);
  }

  let summary: Summary;
  try {
    summary = analyzeAll(files, {
      thresholds: parsed.thresholds,
      asr: parsed.asr,
      asrLang: parsed.asrLang,
      keyword: parsed.keyword,
      whisperModel: parsed.whisperModel,
    });
  } catch (e) {
    console.error(`Analysis error: ${(e as Error).message}`);
    process.exit(2);
  }

  const json = JSON.stringify(summary, null, 2);
  if (parsed.output) {
    fs.writeFileSync(parsed.output, json);
  }

  console.log(json);

  // Human-readable lines to stderr so JSON on stdout stays machine-clean.
  for (const v of summary.verdicts) {
    const flag = v.pass ? 'PASS' : 'FAIL';
    const dbfs = v.rmsDbfs === NEG_INFINITY_DBFS ? '-inf' : v.rmsDbfs.toFixed(1);
    console.error(
      `${flag}  ${path.basename(v.file)}  ${v.durationSec.toFixed(2)}s  ` +
        `${dbfs} dBFS  silence=${(v.silenceRatio * 100).toFixed(1)}%` +
        (v.reasons.length ? `  (${v.reasons.join('; ')})` : ''),
    );
    if (v.asr) {
      console.error(
        v.asr.available
          ? `      ASR: "${v.asr.text}"`
          : `      ASR: ${v.asr.note}`,
      );
    }
  }
  console.error(
    `\n${summary.passed}/${summary.total} passed — ${summary.pass ? 'PASS' : 'FAIL'}`,
  );

  process.exit(summary.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}
