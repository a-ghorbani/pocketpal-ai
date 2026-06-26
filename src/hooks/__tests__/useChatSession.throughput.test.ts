import {computeGenThroughput} from '../useChatSession';

// The displayed generation throughput is NATIVE-FIRST: llama.cpp's own rate is
// used whenever it counted ~all the tokens we generated (predicted_n ≈
// tokens_predicted), which is self-healing and avoids our wall-clock quirks.
// Speculative (MTP) turns fail that predicate — llama.cpp buckets MTP's
// multi-token verify batches as prompt eval, so predicted_n comes back ~0 even
// though tokens_predicted is accurate — and fall back to a wall-clock rate
// measured over the LAST STEP only (run_finished sees finalResult = the last
// step), which also fixes multi-step / tool-call under-reporting.
describe('computeGenThroughput', () => {
  describe('native-first (trustworthy native rate)', () => {
    it('returns the native pair when predicted_n ≈ tokens_predicted and pps > 0', () => {
      // llama.cpp counted ~all generated tokens (40/42 ≥ 50%), so its rate is
      // representative and used verbatim — the wall-clock window is ignored even
      // though it would compute a different number.
      const result = computeGenThroughput({
        tokensPredicted: 42,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: {
          predicted_per_second: 80,
          predicted_per_token_ms: 12.5,
          predicted_n: 40,
        },
      });

      expect(result.predicted_per_second).toBe(80);
      expect(result.predicted_per_token_ms).toBe(12.5);
    });

    it('keeps the native predicted_per_second / predicted_per_token_ms as a pair', () => {
      // Self-healing: once upstream fixes MTP n_eval bucketing, predicted_n
      // tracks tokens_predicted again and native is used with no code change.
      const result = computeGenThroughput({
        tokensPredicted: 100,
        lastStepFirstTokenMs: 0,
        completionEndMs: 5000,
        nativeTimings: {
          predicted_per_second: 33.3,
          predicted_per_token_ms: 30,
          predicted_n: 100,
        },
      });

      expect(result.predicted_per_second).toBe(33.3);
      expect(result.predicted_per_token_ms).toBe(30);
    });
  });

  describe('wall-clock fallback (untrustworthy native rate)', () => {
    it('uses the last-step wall-clock window for MTP turns where predicted_n ≈ 0', () => {
      // MTP: native counter reports a 0 rate and predicted_n ≈ 0 even though
      // tokens_predicted is accurate. Wall-clock window = end - lastStepFirst =
      // 3000 - 1000 = 2000ms; 40 tokens / 2s = 20 tok/s; 2000/40 = 50 ms/token.
      const result = computeGenThroughput({
        tokensPredicted: 40,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: {
          predicted_per_second: 0,
          predicted_per_token_ms: 0,
          predicted_n: 0,
        },
      });

      expect(result.predicted_per_second).toBeCloseTo(20);
      expect(result.predicted_per_token_ms).toBeCloseTo(50);
    });

    it('falls back to wall-clock for partial-MTP where predicted_n ≪ tokens_predicted', () => {
      // Partial MTP: native reports a positive rate, but it only counted a
      // fraction of the generated tokens (10/40 < 50%), so it is not
      // representative → wall-clock. Window = 2500 - 500 = 2000ms; 40/2s = 20.
      const result = computeGenThroughput({
        tokensPredicted: 40,
        lastStepFirstTokenMs: 500,
        completionEndMs: 2500,
        nativeTimings: {
          predicted_per_second: 90,
          predicted_per_token_ms: 11,
          predicted_n: 10,
        },
      });

      expect(result.predicted_per_second).toBeCloseTo(20);
      expect(result.predicted_per_token_ms).toBeCloseTo(50);
    });

    it('falls back to wall-clock when native predicted_per_second is NaN', () => {
      const result = computeGenThroughput({
        tokensPredicted: 40,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: {
          predicted_per_second: NaN,
          predicted_per_token_ms: NaN,
          predicted_n: 40,
        },
      });

      expect(result.predicted_per_second).toBeCloseTo(20);
      expect(result.predicted_per_token_ms).toBeCloseTo(50);
    });

    it('falls back to wall-clock when native predicted_per_second is Infinity', () => {
      const result = computeGenThroughput({
        tokensPredicted: 40,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: {
          predicted_per_second: Infinity,
          predicted_per_token_ms: 0,
          predicted_n: 40,
        },
      });

      expect(result.predicted_per_second).toBeCloseTo(20);
      expect(result.predicted_per_token_ms).toBeCloseTo(50);
    });

    it('falls back to wall-clock when predicted_n is missing', () => {
      // No predicted_n field at all → cannot trust the native rate → wall-clock.
      const result = computeGenThroughput({
        tokensPredicted: 40,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
      });

      expect(result.predicted_per_second).toBeCloseTo(20);
      expect(result.predicted_per_token_ms).toBeCloseTo(50);
    });
  });

  describe('last-step windowing', () => {
    it('windows over the LAST step only (single-step turn == whole gen window)', () => {
      // Single step: lastStepFirstTokenMs is the turn's first token, so the
      // window is the whole gen window — unchanged behaviour. 30 / (3000-1500)
      // = 30/1.5s = 20 tok/s.
      const result = computeGenThroughput({
        tokensPredicted: 30,
        lastStepFirstTokenMs: 1500,
        completionEndMs: 3000,
        nativeTimings: {
          predicted_per_second: 0,
          predicted_per_token_ms: 0,
          predicted_n: 0,
        },
      });

      expect(result.predicted_per_second).toBeCloseTo(20);
      expect(result.predicted_per_token_ms).toBeCloseTo(50);
    });

    it('uses ONLY the last step window for a multi-step turn (not the whole turn)', () => {
      // Multi-step / tool-call turn: finalResult.tokens_predicted = 30 is the
      // LAST step's count, and lastStepFirstTokenMs = 8000 is that step's first
      // token (the turn started much earlier). The rate must divide by the last
      // step window (10000-8000 = 2000ms → 15 tok/s), NOT by the whole turn.
      const lastStepRate = computeGenThroughput({
        tokensPredicted: 30,
        lastStepFirstTokenMs: 8000,
        completionEndMs: 10000,
        nativeTimings: {
          predicted_per_second: 0,
          predicted_per_token_ms: 0,
          predicted_n: 0,
        },
      });
      expect(lastStepRate.predicted_per_second).toBeCloseTo(15);
      expect(lastStepRate.predicted_per_token_ms).toBeCloseTo(66.667, 2);

      // A whole-turn window (e.g. first token at 1000) would dilute it to a
      // much lower, wrong rate — proving the last-step window matters.
      const wholeTurnRate = computeGenThroughput({
        tokensPredicted: 30,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 10000,
        nativeTimings: {
          predicted_per_second: 0,
          predicted_per_token_ms: 0,
          predicted_n: 0,
        },
      });
      expect(wholeTurnRate.predicted_per_second).toBeCloseTo(30 / 9);
      expect(wholeTurnRate.predicted_per_second).toBeLessThan(
        lastStepRate.predicted_per_second!,
      );
    });
  });

  describe('guards (return native — never a worse number)', () => {
    it('falls back to the native rate when tokens_predicted is missing', () => {
      const result = computeGenThroughput({
        tokensPredicted: undefined,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        // predicted_n missing → native untrustworthy, but the wall-clock path
        // is also unusable (no tokens), so the native pair is returned as-is.
        nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
      });

      expect(result.predicted_per_second).toBe(80);
      expect(result.predicted_per_token_ms).toBe(12.5);
    });

    it('falls back to the native rate when tokens_predicted is 0', () => {
      const result = computeGenThroughput({
        tokensPredicted: 0,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
      });

      expect(result.predicted_per_second).toBe(80);
      expect(result.predicted_per_token_ms).toBe(12.5);
    });

    it('falls back to the native rate when the last-step first token is missing', () => {
      const result = computeGenThroughput({
        tokensPredicted: 30,
        lastStepFirstTokenMs: null,
        completionEndMs: 3000,
        nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
      });

      expect(result.predicted_per_second).toBe(80);
      expect(result.predicted_per_token_ms).toBe(12.5);
    });

    it('falls back to the native rate when the last-step window is non-positive', () => {
      // end <= lastStepFirstToken → genMs <= 0 (clock skew or an instant stop).
      const result = computeGenThroughput({
        tokensPredicted: 30,
        lastStepFirstTokenMs: 3000,
        completionEndMs: 3000,
        nativeTimings: {predicted_per_second: 80, predicted_per_token_ms: 12.5},
      });

      expect(result.predicted_per_second).toBe(80);
      expect(result.predicted_per_token_ms).toBe(12.5);
    });

    it('passes through undefined native fields when the fallback path is taken with no native timings', () => {
      const result = computeGenThroughput({
        tokensPredicted: 0,
        lastStepFirstTokenMs: 1000,
        completionEndMs: 3000,
        nativeTimings: undefined,
      });

      expect(result.predicted_per_second).toBeUndefined();
      expect(result.predicted_per_token_ms).toBeUndefined();
    });
  });
});
