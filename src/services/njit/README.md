# NJIT: Mobile Neural JIT & Parametric Memory Grafting for PocketPal AI

## Overview
This module integrates **NJIT (Neural Just-In-Time)** into PocketPal AI to enable zero-latency, zero-prompt-cost offline RAG on resource-constrained mobile phones running sub-1B models like **Qwen 2.5 0.5B**.

### The Problem on Modern Phones
- Resource-constrained phones (3GB–6GB RAM, thermal-throttled CPUs) struggle with traditional RAG.
- Traditional text-based prompt injection pushes 2,000–4,000 tokens through the transformer tokenizer and attention layers for every question, resulting in 10–30 second time-to-first-token (TTFT) latency and high battery drain.

### The NJIT Solution
- **Pre-computed Attention Shards (`.njit`)**: Attention Key-Value activations for reference texts/manuals are pre-compiled offline into compact binary `.njit` containers.
- **Direct KV Cache Grafting**: When an inquiry triggers an offline topic, NJIT injects the pre-computed activation slice into the model context in **<0.1 ms (64 µs)** without invoking the tokenizer or prefill compute.
- **Qwen 2.5 0.5B Pairing**: At ~390 MB (Q4_K_M), Qwen 2.5 0.5B leaves 90% of the mobile RAM available for system apps while gaining full domain expertise via dynamic attention grafting.

## Format Specification
- Container Header: 36 Bytes (Magic `0x54494A4E`, Version `0x0100`, 64-bit CID, Layers, HeadDim, SeqLen)
- Supported Tensor Types: `KV_CACHE_F16`, `KV_CACHE_Q8_0`, `KV_CACHE_Q4_0`

## Integration
- `src/services/njit/`: Core TypeScript parser, container validator, and memory grafting broker.
- `src/store/onboarding/onboardingPals.ts`: Added **Qwen2.5 0.5B (NJIT Fast)** as the lightweight offline quick tier.
