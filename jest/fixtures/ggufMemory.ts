import * as fs from 'fs';
import * as path from 'path';

/**
 * Captured GGUF metadata and llama.cpp buffer sizes; see
 * `gguf-memory/README.md` for how and with which parameters.
 */
const DIR = path.join(__dirname, 'gguf-memory');

export type GGUFMemoryFixture =
  | 'gemma-3-1b-it-Q4_K_M'
  | 'gemma-3-4b-it-Q4_0'
  | 'gemma-3n-E2B-it-Q4_K_M'
  | 'gemma-4-E2B-it-Q4_0'
  | 'gemma-4-E4B-it-Q4_0'
  | 'HuggingFaceTB_SmolLM3-3B-Q4_0'
  | 'LFM2-2.6B-Q4_K_M'
  | 'LFM2.5-1.2B-Instruct-Q4_K_M'
  | 'LFM2.5-350M-Q4_K_M'
  | 'LFM2.5-8B-A1B-Q4_0'
  | 'microsoft_Phi-4-mini-instruct-Q4_0'
  | 'mistralai_Ministral-3-3B-Instruct-2512-Q4_0'
  | 'Phi-3.5-mini-instruct-Q4_K_M'
  | 'Qwen3.5-0.8B-Q4_0'
  | 'Qwen3.5-2B-Q4_0'
  | 'Qwen3.5-4B-Q4_0'
  | 'Qwen3-VL-2B-Instruct-Q4_K_M'
  | 'Qwen_Qwen3-1.7B-Q4_K_M'
  | 'Qwen_Qwen3-4B-Q4_K_M'
  | 'smollm2-1.7b-instruct-q4_k_m';

export type FlashAttnCapture = 'off' | 'auto';

export interface BufferCapture {
  n_ctx: number;
  fa: FlashAttnCapture;
  model: number;
  context: number;
  compute: number;
}

export function ggufMetadata(name: GGUFMemoryFixture): Record<string, any> {
  return JSON.parse(
    fs.readFileSync(path.join(DIR, 'metadata', `${name}.json`), 'utf8'),
  );
}

export function ggufFileSize(name: GGUFMemoryFixture): number {
  const row = fs
    .readFileSync(path.join(DIR, 'file-sizes.tsv'), 'utf8')
    .split('\n')
    .map(line => line.split('\t'))
    .find(([file]) => file === name);
  if (!row) {
    throw new Error(`no file size captured for ${name}`);
  }
  return Number(row[1]);
}

/**
 * Every captured `RESULT` line for a model, the 32k file included.
 */
export function bufferCaptures(name: GGUFMemoryFixture): BufferCapture[] {
  return fs
    .readdirSync(path.join(DIR, 'buffers'))
    .filter(file => file === `${name}.txt` || file === `${name}.32k.txt`)
    .flatMap(file =>
      fs
        .readFileSync(path.join(DIR, 'buffers', file), 'utf8')
        .split('\n')
        .map(line =>
          /^RESULT n_ctx=(\d+) fa=(off|auto) model=(\d+) context=(\d+) compute=(\d+)/.exec(
            line,
          ),
        )
        .filter((match): match is RegExpExecArray => match !== null)
        .map(match => ({
          n_ctx: Number(match[1]),
          fa: match[2] as FlashAttnCapture,
          model: Number(match[3]),
          context: Number(match[4]),
          compute: Number(match[5]),
        })),
    );
}

export function bufferCapture(
  name: GGUFMemoryFixture,
  n_ctx: number,
  fa: FlashAttnCapture,
): BufferCapture {
  const capture = bufferCaptures(name).find(
    c => c.n_ctx === n_ctx && c.fa === fa,
  );
  if (!capture) {
    throw new Error(`no capture for ${name} at n_ctx ${n_ctx}, fa ${fa}`);
  }
  return capture;
}
