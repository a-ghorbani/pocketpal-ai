# Bench-Knobs Sweep Plan — Next Phase

**Status**: planning
**Date**: 2026-05-06
**Author**: dev-team
**Foundation**: `~/codes/rd-team/research/reports/2026-05-06-generic-gguf-bench-settings-knobs-foundation.md`
**Schema**: bench-config v1.1 (this PR — TASK-20260505-1612)

## Goal

Produce a **decision tree** for Android: given a device profile (chip class, RAM tier) and model architecture, pick settings (`backend`, `quant`, `use_mmap`, `no_extra_bufts`, `cache_type_k/v`, `flash_attn_type`) that maximise throughput **without** hitting the duplicate-residency / OOM cliff.

End artefact: a `recommendSettings(deviceProfile, modelMeta) → SettingsKnobs` helper plus a published rules table.

## Key constraint from the foundation report

Memory-hazard asymmetry between platforms:

- **Android CPU path**: `mmap=true + repack=on` keeps mapped GGUF pages **AND** allocates a repacked CPU destination buffer. For repack-eligible quants (q4_0, q4_K, q5_K, q8_0, iq4_nl), peak weight memory approaches **2× the quant payload** before KV/compute. This is the failure mode to avoid first.
- **Apple Metal path** (out of scope this phase, planned 2.5): inverse — Metal advertises host-pointer buffer support, so `mmap=false` forces a separate copy. There, mmap=true is the safe default.

Sweeps below are designed for **Android only**; iOS / Metal counterpart is a separate phase.

## Pre-work — required before the sweep is meaningful

These three items block rule derivation. Without them, sweep results are uninterpretable for memory rules.

| # | Gap | Why it blocks | Effort |
|---|---|---|---|
| 1 | `peak_memory_mb` measures **device-wide RAM** (`RNDeviceInfo.getUsedMemory()` at `BenchmarkRunnerScreen.tsx:150-162`), not process PSS | The duplicate-residency hazard is invisible without process-PSS. Rule "guard against mmap+repack on Android" cannot be evidence-based. | ~1h: swap for `Debug.MemoryInfo.getTotalPss()` on Android, equivalent on iOS for parity |
| 2 | Single peak sample only — no load / post-load / post-pp / post-tg distinction | Foundation report's "always record" list separates these. Without it we conflate load-time peak with steady-state. | ~2-3h: 4-checkpoint sampling around the bench call |
| 3 | `n_ctx` is fixed at the bench protocol's pp+tg sum; KV growth invisible | KV-quant impact only shows up at long context. Bench at pp=512/tg=128 → KV ~tens of MiB, can't measure KV-quant savings. | ~1h: add n_ctx as sweep axis |
| 4 | No `flash_attn_actually_enabled` parsing | The report explicitly flags `flash_attn_type=auto` as something that may be silently disabled by graph-assignment checks. We sweep it but can't confirm the cell actually used FA. | ~30min: add log-signal regex for `flash_attn = 1` / `0` |
| 5 | No build-variant tag in report | Report's open question #1: which paths are compiled? On Klee we observed `librnllama_jni_v8_2_dotprod_i8mm.so` (lean, no Hexagon/OpenCL). Each device's effective backend support depends on the runtime-selected JNI lib. | ~30min: parse `Load /data/.../librnllama_jni_*.so` log, stamp on report |

Recommended packaging: **Story 1** = items 1 + 2 + 3 + 4 + 5 (~5h). One PR, one quick complexity.

## Sweep design — fractional, not full cartesian

Full cartesian (3 models × 4 quants × 3 backends × 4 mmap×repack × 3 KV × 2 FA) ≈ 864 cells/device, 30+ hours. We split into 3 focused sweeps, each holding 1-2 axes constant to keep cell counts tractable.

### Sweep A — Memory residency hazard (CPU)

The headline test for the foundation report's #1 finding.

| Axis | Values | Rationale |
|---|---|---|
| backend | `cpu` (fixed) | Isolate CPU repack path |
| model | qwen3-1.7b, gemma-3-1b, phi-3.5-mini | Std attention vs sliding-window vs alt-GQA-ratio |
| quant | q4_0, q4_K_M, q8_0 | NPU-compat repack target, mainstream repack target, high-mem ref |
| use_mmap | true, false | Full cross |
| no_extra_bufts | false (repack ON), true (repack OFF) | Full cross |
| KV (k/v) | f16/f16 | Fixed |
| flash_attn_type | auto | Fixed |

**3 × 3 × 2 × 2 = 36 cells / device.** ~45-60 min/device.

**Expected validation**:
```
qwen3-1.7b q4_0  cpu  mmap=true  repack=ON   → PSS_post_load ≈ 2× weights_mib  (HAZARD)
                      mmap=true  repack=OFF  → PSS_post_load ≈ 1× weights_mib  (SAFE)
                      mmap=false repack=ON   → PSS_post_load ≈ 1× weights_mib  (slow load, safe)
                      mmap=false repack=OFF  → PSS_post_load ≈ 1× weights_mib  (slow load, safe)
```

If the (true, ON) corner does NOT show doubling in PSS, either (a) llama.cpp's `load_tensors:` lines undercount the mapped-source pages (likely — they only report the destination buffer), or (b) the repack path wasn't selected for this quant on this CPU. The deterministic `weights_total_mib` will only show ~1× because llama.cpp reports the destination, not the source. **PSS is the only signal that exposes the duplicate.**

### Sweep B — Backend × quant interaction

Isolates "which backend wins per quant" without conflating the residency hazard.

| Axis | Values | Rationale |
|---|---|---|
| backend | cpu, gpu, hexagon (skip if absent) | Per-device backend coverage |
| model | qwen3-1.7b, phi-3.5-mini | Drop gemma — sliding-window confounds backend comparison |
| quant | q4_0, q4_K_M, q5_K_M, q8_0 | Hexagon-compat ↔ K-quant boundary |
| use_mmap | true (fixed) | Memory-safe baseline |
| no_extra_bufts | true (CPU repack OFF; fixed) | Memory-safe baseline. Per the report, CPU repack doesn't apply to offloaded layers anyway, and Hexagon's HTP-REPACK is a separate device-extra-buffer path that runs regardless. |
| KV (k/v) | f16/f16 | Fixed |
| flash_attn_type | auto | Fixed |

**2 × 4 × 3 = 24 cells / device** (less for non-Hexagon devices).

**Expected outputs**:
- Backend ranking per (model, quant) — pp/tg tables
- K-quant boundary verification: q4_K_M and q5_K_M on Hexagon should silently fall back to CPU (Hexagon supports only q4_0 / q8_0 / MXFP4). Effective_backend should fall through.
- requested_backend × effective_backend mismatch matrix (catches misclassifications like the Myron parser-miss we just diagnosed)

### Sweep C — KV cache + Flash Attention (long context)

Requires Pre-work item 3 (n_ctx axis). Targets long-context memory rules.

| Axis | Values | Rationale |
|---|---|---|
| backend | (winner of Sweep B per device) | One backend |
| model | qwen3-1.7b (fixed) | Standard attention, predictable KV shape |
| quant | q4_K_M (fixed) | Mainstream baseline |
| n_ctx | 2048, 4096, 8192 | Where KV starts to dominate |
| KV (k/v) | f16/f16, q8_0/q8_0, q4_0/q4_0 | 3 KV configs |
| flash_attn_type | auto, off | Cross — but quantized V invalid with FA off (auto-rejected by upstream) |

**3 × 3 × 2 = 18 nominal cells, ~12 valid** (FA off + quantized V is rejected by llama.cpp). ~20-30 min/device.

**Expected outputs**:
- KV memory growth curve at 2k/4k/8k by KV-quant config
- FA's actually-enabled status per backend / context combination
- Whether quantized KV pays off at our typical context (suspected: not until 4k+; report-grounded)

### Total

**~70 cells/device, ~2 hours bench time/device.** Plus model-load time (one-time per (model, quant) pair after cache warm-up).

## Device coverage

| Device | Chip | Hexagon | OpenCL | RAM | Status |
|---|---|---|---|---|---|
| POCO X9 Pro Myron | Snapdragon 8 Elite Gen 5 | v81 | Adreno 840 ✅ | 12GB | ✅ have |
| Samsung S23 | Snapdragon 8 Gen 2 | v73 | Adreno 740 ✅ | 8GB | ✅ have (older baseline) |
| POCO X7 Pro Klee | MediaTek Dimensity 8400 | ❌ | Mali-G720 ⚠️ (build lacks OpenCL) | 8GB | ✅ have, needs CPU-hang investigation |

**Gaps that limit rule confidence**:
- **Low-end Snapdragon** (e.g. SD 7 Gen / 6 Gen) — narrower NPU, older Adreno
- **Pixel / Tensor** — no Hexagon, ARM Mali variant, distinct thermal profile
- **Low-RAM device** (4-6 GB) — where memory rules matter most

Rule confidence will be CAVEATED for tiers we haven't measured. Filling these gaps improves rules more than re-running existing devices.

## Rules format

Output is a small set of rules + a `recommendSettings()` helper. Examples:

```
RULE — Backend selection (decision tree, top-down):
  if has_hexagon AND quant ∈ {q4_0, q8_0, MXFP4}:
    if pp_workload_dominant: backend = hexagon
    else (tg-dominant chat):  backend = gpu (Adreno OpenCL) — usually wins tg
  elif has_working_opencl:
    backend = gpu
  else:
    backend = cpu

RULE — Memory hazard guard (Android CPU):
  if backend == 'cpu' AND quant ∈ REPACK_TYPES:
    if ram_free < model_size * 2 + KV_estimate + 500MB:
      MUST: no_extra_bufts=true   (avoid duplicate residency)
    else:
      MAY: no_extra_bufts=false   (faster steady-state; warn UI when peak approaches jetsam)

RULE — KV quant:
  if n_ctx >= 4096 AND backend supports FA:
    KV = q8_0/q8_0  (~50% KV memory savings, minimal quality loss reported)
  else:
    KV = f16/f16

RULE — Quant selection per RAM:
  if ram_free < 4 GB:  quant ≤ q4_K_M
  if ram_free < 6 GB:  quant ≤ q5_K_M
  if ram_free >= 8 GB: quant ≤ q8_0 if backend supports it
```

The `recommendSettings()` API would emit knobs + a confidence tier + a brief rationale string for transparency.

## Cross-platform asymmetry — planned Phase 2.5 (iOS)

The Metal path inverts the mmap hazard:
- **Metal** with `mmap=true`: mapped pages can be the final tensor storage (host-pointer buffer support) → **safe default**
- **Metal** with `mmap=false`: forces a separate Metal copy → doubles weight memory
- CPU repack on iOS still has the same hazard as Android when CPU fallback fires

The eventual `recommendSettings()` should be platform-conditioned at the top level.

## Risks / open questions before running

1. **Klee CPU hang** — `qwen3-1.7b q4_0 × cpu` hung twice (2× 10+ min). Could be MediaTek thermal throttling at sustained CPU load, an Android scheduler quirk, or an OOM-kill that didn't surface in logcat. Worth a 30-min investigation before running 36 CPU cells on Klee. Mitigation: between-cell cooldown (e.g. 30s), or smaller-model probe (smollm2 / gemma-1b) to confirm bench harness works there.

2. **Build-variant matrix** — Klee loads `librnllama_jni_v8_2_dotprod_i8mm.so` (lean, no Hexagon/OpenCL). Some sweep cells will be no-ops on devices that lack the compiled path. Pre-work item 5 stamps the JNI variant on every report so we can filter post-hoc.

3. **`flash_attn_type=auto` actual state** — report flags this as something that may be silently disabled by graph-assignment checks. We sweep it but can't confirm without pre-work item 4.

4. **Statistical confidence at nr=3** — for rule derivation we may want nr=5 on a smaller subset, or replicate the most-load-bearing cells (e.g. backend tie-breakers).

5. **PSS field on iOS** — `RNDeviceInfo.getUsedMemory()` on iOS returns active+inactive pages, similar problem to Android. Pre-work item 1 should fix both platforms or document the asymmetry.

## Suggested execution order

1. **Story 1 (~5h, quick complexity)** — pre-work items 1-5 above. One PR.
2. **Story 2 (~1-2h)** — investigate Klee CPU hang. If thermal: add cooldown. If a real bug: file separately.
3. **Story 3 (~6-8h bench + analysis)** — run Sweep A / B / C across the 3 devices. Capture all reports.
4. **Story 4 (~4h)** — derive rules from data. Implement `recommendSettings()`. Publish rules table + algorithm rationale. Add UI surfacing for the memory-hazard warn case.
5. **Story 5 (optional, hardware-dependent)** — fill device gaps (low-end Snapdragon, Pixel, low-RAM device). Re-derive rules with broader coverage.

**Total estimated effort: 2-3 working days** of engineering + bench time, excluding device-acquisition time for Story 5.

## What this PR (TASK-20260505-1612) sets up for Phase 2

- v1.1 schema with `settings_overrides`, `settings_fingerprint` — required to dedupe across the sweep matrix
- Hexagon backend value + I7 fail-fast — Sweep B's hexagon arm depends on this
- Structured `memory_buffers.{weights,kv_cache,compute}_{mib,total_mib}` — feeds the deterministic-allocation side of memory analysis
- Re-derive at merge time — when Phase 2 adds new structured fields, existing source raw_matches backfill automatically
- Backfilled baselines (Myron 100%, Samsung 98%, Klee 46%) — Sweep A/B comparison points for "did the new sweep change anything" regressions

What's still missing (the pre-work above): process PSS, 4-checkpoint snapshots, n_ctx axis, FA-actually-enabled signal, JNI-variant signal.
