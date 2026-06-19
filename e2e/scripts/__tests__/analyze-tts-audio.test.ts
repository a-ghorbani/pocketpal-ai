#!/usr/bin/env npx tsx

/**
 * Tests for the TTS audio analyzer. Uses Node's built-in test runner (no jest in
 * e2e), so it runs standalone via tsx:
 *
 *   npx tsx scripts/__tests__/analyze-tts-audio.test.ts
 *   node --test --import tsx scripts/__tests__/analyze-tts-audio.test.ts
 *
 * Proves the analyzer without the synthesis library by generating WAVs in Node:
 *   - a 440 Hz sine tone   -> should PASS (non-silent, speech-like energy)
 *   - a pure-silence buffer -> should FAIL (silent)
 *   - a short click         -> edge case (too short / mostly silent -> FAIL)
 *   - a 32-bit float sine   -> should parse and PASS (float format support)
 *   - a stereo sine         -> should parse (channel averaging) and PASS
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  analyzeFile,
  computeStats,
  DEFAULT_THRESHOLDS,
  parseWav,
  resolveInputs,
} from '../analyze-tts-audio';

const SAMPLE_RATE = 24000;

function writePcm16Wav(
  filePath: string,
  samples: Float32Array,
  sampleRate = SAMPLE_RATE,
  channels = 1,
): void {
  const bytesPerSample = 2;
  const frameCount = Math.floor(samples.length / channels);
  const dataLength = frameCount * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataLength);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataLength, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < frameCount * channels; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  fs.writeFileSync(filePath, buf);
}

function writeFloat32Wav(
  filePath: string,
  samples: Float32Array,
  sampleRate = SAMPLE_RATE,
): void {
  const bytesPerSample = 4;
  const dataLength = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataLength);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataLength, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < samples.length; i++) {
    buf.writeFloatLE(samples[i], 44 + i * bytesPerSample);
  }
  fs.writeFileSync(filePath, buf);
}

function sine(durationSec: number, freq = 440, amp = 0.5): Float32Array {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  return out;
}

function silence(durationSec: number): Float32Array {
  return new Float32Array(Math.floor(durationSec * SAMPLE_RATE));
}

function stereoSine(durationSec: number, freq = 440, amp = 0.5): Float32Array {
  const mono = sine(durationSec, freq, amp);
  const out = new Float32Array(mono.length * 2);
  for (let i = 0; i < mono.length; i++) {
    out[i * 2] = mono[i];
    out[i * 2 + 1] = mono[i];
  }
  return out;
}

let tmpDir = '';

test('setup temp dir', () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-analyzer-'));
});

test('parseWav reads 16-bit PCM header correctly', () => {
  const file = path.join(tmpDir, 'header.wav');
  writePcm16Wav(file, sine(1.0));
  const wav = parseWav(fs.readFileSync(file));
  assert.equal(wav.sampleRate, SAMPLE_RATE);
  assert.equal(wav.bitDepth, 16);
  assert.equal(wav.channels, 1);
  assert.equal(wav.samples.length, SAMPLE_RATE);
});

test('440Hz sine PASSES as non-silent speech-like audio', () => {
  const file = path.join(tmpDir, 'sine.wav');
  writePcm16Wav(file, sine(1.2));
  const v = analyzeFile(file);
  assert.equal(v.pass, true, `expected pass, reasons: ${v.reasons.join(', ')}`);
  assert.equal(v.hasSpeechLikeEnergy, true);
  assert.ok(v.rmsDbfs > DEFAULT_THRESHOLDS.minRmsDbfs);
  assert.ok(v.silenceRatio < 0.5);
  assert.ok(Math.abs(v.durationSec - 1.2) < 0.01);
  assert.equal(v.reasons.length, 0);
});

test('pure silence FAILS', () => {
  const file = path.join(tmpDir, 'silence.wav');
  writePcm16Wav(file, silence(1.5));
  const v = analyzeFile(file);
  assert.equal(v.pass, false);
  assert.equal(v.hasSpeechLikeEnergy, false);
  assert.equal(v.silenceRatio, 1);
  assert.ok(v.reasons.length > 0);
  assert.ok(v.reasons.some(r => r.includes('silence') || r.includes('RMS')));
});

test('short click (edge case) FAILS on duration and silence', () => {
  // 5ms of energy padded by silence: too short and overwhelmingly silent.
  const samples = silence(0.1);
  const clickStart = Math.floor(0.02 * SAMPLE_RATE);
  for (let i = clickStart; i < clickStart + Math.floor(0.005 * SAMPLE_RATE); i++) {
    samples[i] = 0.9;
  }
  const file = path.join(tmpDir, 'click.wav');
  writePcm16Wav(file, samples);
  const v = analyzeFile(file);
  assert.equal(v.pass, false);
  assert.ok(v.peak > 0.5, 'click should register a peak');
  assert.ok(
    v.reasons.some(r => r.includes('duration')) ||
      v.reasons.some(r => r.includes('silence')),
  );
});

test('32-bit float sine parses and PASSES', () => {
  const file = path.join(tmpDir, 'float.wav');
  writeFloat32Wav(file, sine(1.0));
  const wav = parseWav(fs.readFileSync(file));
  assert.equal(wav.bitDepth, 32);
  const v = analyzeFile(file);
  assert.equal(v.pass, true, `reasons: ${v.reasons.join(', ')}`);
  assert.equal(v.bitDepth, 32);
});

test('stereo sine averages channels and PASSES', () => {
  const file = path.join(tmpDir, 'stereo.wav');
  writePcm16Wav(file, stereoSine(1.0), SAMPLE_RATE, 2);
  const wav = parseWav(fs.readFileSync(file));
  assert.equal(wav.channels, 2);
  assert.equal(wav.samples.length, SAMPLE_RATE);
  const v = analyzeFile(file);
  assert.equal(v.pass, true, `reasons: ${v.reasons.join(', ')}`);
  assert.equal(v.channels, 2);
});

test('leading/trailing silence are measured', () => {
  const lead = silence(0.3);
  const tone = sine(0.6);
  const trail = silence(0.4);
  const combined = new Float32Array(lead.length + tone.length + trail.length);
  combined.set(lead, 0);
  combined.set(tone, lead.length);
  combined.set(trail, lead.length + tone.length);
  const file = path.join(tmpDir, 'padded.wav');
  writePcm16Wav(file, combined);
  const v = analyzeFile(file);
  assert.ok(Math.abs(v.leadingSilenceSec - 0.3) < 0.02);
  assert.ok(Math.abs(v.trailingSilenceSec - 0.4) < 0.02);
});

test('computeStats reports -inf dBFS for empty audio', () => {
  const stats = computeStats(
    {sampleRate: SAMPLE_RATE, bitDepth: 16, channels: 1, samples: new Float32Array(0)},
    DEFAULT_THRESHOLDS.silenceFloor,
  );
  assert.equal(stats.rmsDbfs, -Infinity);
  assert.equal(stats.silenceRatio, 1);
});

test('parseWav rejects a non-RIFF file', () => {
  assert.throws(() => parseWav(Buffer.from('not a wav file at all')), /RIFF/);
});

test('custom thresholds override defaults', () => {
  const file = path.join(tmpDir, 'quiet.wav');
  writePcm16Wav(file, sine(1.0, 440, 0.02)); // ~ -37 dBFS
  // Default min is -50 dBFS so it passes; a strict -30 dBFS floor fails it.
  assert.equal(analyzeFile(file).pass, true);
  const strict = analyzeFile(file, {thresholds: {minRmsDbfs: -30}});
  assert.equal(strict.pass, false);
  assert.ok(strict.reasons.some(r => r.includes('RMS')));
});

test('resolveInputs expands a directory of wavs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-glob-'));
  writePcm16Wav(path.join(dir, 'a.wav'), sine(1.0));
  writePcm16Wav(path.join(dir, 'b.wav'), sine(1.0));
  fs.writeFileSync(path.join(dir, 'note.txt'), 'ignore me');
  const resolved = resolveInputs(dir);
  assert.equal(resolved.length, 2);
  assert.ok(resolved.every(f => f.endsWith('.wav')));
  fs.rmSync(dir, {recursive: true, force: true});
});

test('cleanup temp dir', () => {
  if (tmpDir) {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
});
