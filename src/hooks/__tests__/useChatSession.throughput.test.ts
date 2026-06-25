import {computeGenThroughput} from '../useChatSession';

// The displayed generation throughput is derived from the wall-clock pieces the
// hook tracks (run start → first token → run end), and falls back to the native
// rate when a wall-clock piece is unusable. The native per-second counter is
// unreliable for speculative (MTP) turns — llama.cpp buckets MTP's multi-token
// verification batches as prompt eval, so it reports 0 even when generation
// succeeded — which is why the wall-clock value is preferred.
describe('computeGenThroughput', () => {
  const nativeTimings = {
    predicted_per_second: 0,
    predicted_per_token_ms: 0,
  };

  it('computes tok/s and ms/token from the wall-clock generation window', () => {
    // Generation window = end - (start + ttft) = 3000 - (1000 + 500) = 1500ms.
    // 30 tokens / 1.5s = 20 tok/s; 1500ms / 30 tokens = 50 ms/token.
    const result = computeGenThroughput({
      tokensPredicted: 30,
      completionStartTime: 1000,
      timeToFirstTokenMs: 500,
      completionEndMs: 3000,
      nativeTimings,
    });

    expect(result.predicted_per_second).toBeCloseTo(20);
    expect(result.predicted_per_token_ms).toBeCloseTo(50);
  });

  it('uses the wall-clock value for MTP turns where the native rate is 0', () => {
    // An MTP turn: native counter reports 0 tok/s, but tokens_predicted is
    // accurate, so the wall-clock value is a real, non-zero rate.
    const result = computeGenThroughput({
      tokensPredicted: 40,
      completionStartTime: 0,
      timeToFirstTokenMs: 0,
      completionEndMs: 2000,
      nativeTimings: {predicted_per_second: 0, predicted_per_token_ms: 0},
    });

    expect(result.predicted_per_second).toBeCloseTo(20);
    expect(result.predicted_per_token_ms).toBeCloseTo(50);
  });

  it('falls back to the native rate when tokens_predicted is missing', () => {
    const result = computeGenThroughput({
      tokensPredicted: undefined,
      completionStartTime: 1000,
      timeToFirstTokenMs: 500,
      completionEndMs: 3000,
      nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
    });

    expect(result.predicted_per_second).toBe(80);
    expect(result.predicted_per_token_ms).toBe(12.5);
  });

  it('falls back to the native rate when tokens_predicted is 0', () => {
    const result = computeGenThroughput({
      tokensPredicted: 0,
      completionStartTime: 1000,
      timeToFirstTokenMs: 500,
      completionEndMs: 3000,
      nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
    });

    expect(result.predicted_per_second).toBe(80);
    expect(result.predicted_per_token_ms).toBe(12.5);
  });

  it('falls back to the native rate when time-to-first-token is missing', () => {
    const result = computeGenThroughput({
      tokensPredicted: 30,
      completionStartTime: 1000,
      timeToFirstTokenMs: null,
      completionEndMs: 3000,
      nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
    });

    expect(result.predicted_per_second).toBe(80);
    expect(result.predicted_per_token_ms).toBe(12.5);
  });

  it('falls back to the native rate when the generation window is non-positive', () => {
    // end <= start + ttft → genMs <= 0 (e.g. clock skew or an instant stop).
    const result = computeGenThroughput({
      tokensPredicted: 30,
      completionStartTime: 1000,
      timeToFirstTokenMs: 500,
      completionEndMs: 1500,
      nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
    });

    expect(result.predicted_per_second).toBe(80);
    expect(result.predicted_per_token_ms).toBe(12.5);
  });

  it('passes through undefined native fields when the fallback path is taken with no native timings', () => {
    const result = computeGenThroughput({
      tokensPredicted: 0,
      completionStartTime: 1000,
      timeToFirstTokenMs: 500,
      completionEndMs: 3000,
      nativeTimings: undefined,
    });

    expect(result.predicted_per_second).toBeUndefined();
    expect(result.predicted_per_token_ms).toBeUndefined();
  });
});
