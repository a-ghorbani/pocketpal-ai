# Benchmark baselines

Captured at `bench: {pp:512, tg:128, pl:1, nr:3}` per the unified config
builder in `e2e/helpers/bench-runner.ts:buildConfig`.

The on-device `BenchmarkReport` JSON now persists this `bench` block at the
top level, and `e2e/scripts/benchmark-compare.ts` rejects baseline/current
pairs whose blocks differ (CLI exits 2). When `bench` is absent on either
side (legacy reports), the protocol-mismatch check is skipped with a stderr
warning so old reports keep loading until they are recaptured.

## TODO

- **POCO X9 Pro Myron**: `poco-myron.json` was captured at `nr: 1`
  (pre-unification baseline; PR #702 round-1 review). The compare script's
  graceful-degradation path keeps it loading, but it is protocol-skewed
  against any current run produced by the unified `nr: 3` config. Re-capture
  next time the device is available.
