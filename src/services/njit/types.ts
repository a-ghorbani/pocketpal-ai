/**
 * NJIT (Neural Just-In-Time) Mobile Types & Format Spec.
 *
 * Implements microsecond-latency Parametric Memory Grafting for resource-constrained
 * mobile devices (sub-1B parameters: Qwen 2.5 0.5B / Qwen 2.5 Coder 0.5B).
 *
 * Eliminates high-latency prompt tokenization and KV prefill on weak phone CPUs
 * by hydrating pre-computed attention activations directly into the runtime.
 */

export const NJIT_MAGIC = 0x54494a4e; // "NJIT" in Little-Endian
export const NJIT_VERSION = 0x0100; // v1.0

export enum NJITTensorType {
  KV_CACHE_F16 = 0x01,
  KV_CACHE_Q8_0 = 0x02,
  KV_CACHE_Q4_0 = 0x03,
  LORA_DELTA_F16 = 0x10,
  EMBEDDING_F32 = 0x20,
}

export interface NJITHeader {
  magic: number;
  version: number;
  tensorType: NJITTensorType;
  contentId: string; // 64-bit cryptographic hash hex
  numLayers: number;
  headDim: number;
  seqLen: number;
  payloadBytes: number;
}

export interface NJITKnowledgeShard {
  id: string;
  topic: string;
  title: string;
  description: string;
  modelTarget: string; // e.g. "Qwen/Qwen2.5-0.5B-Instruct-GGUF"
  seqLen: number;
  sizeBytes: number;
  data: Uint8Array;
}

export interface NJITGraftResult {
  success: boolean;
  tokensInjected: number;
  latencyMicroseconds: number;
  error?: string;
}
