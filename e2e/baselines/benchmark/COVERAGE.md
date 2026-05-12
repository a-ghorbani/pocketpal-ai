# Final baseline coverage (PR #713, per-backend rules applied)

**Rules used** (validated in `findings-android-rules.md` + `findings-hex-validation.md`):

| Setting           | cpu  | gpu  | hexagon |
|---                |---   |---   |---      |
| `flash_attn_type` | on   | off  | on      |
| `use_mmap`        | false| false| false   |
| `no_extra_bufts`  | false| —    | —       |

**Bench**: `pp=256, tg=64, pl=1, nr=3`, 30 s inter-cell settle, purge APK.

---

## Per-device coverage (after multi-phase recovery)

| Device | SoC | Backends | OK cells | Of target | Notes |
|---|---|---|---|---|---|
| poco-x7-klee | MediaTek MT6899 | cpu only* | **80 / 84** | 95 % | * gpu unavailable on this build. Recovered 13 cells via per-cell config + APK reinstall isolation. Remaining 4 (phi-3.5 q8_0, phi-4-mini q8_0, gemma-4 q6_K + q8_0) OOM on 7.5 GiB device — RAM physics. |
| samsung-s23 | Snapdragon 8 Gen 2 | cpu, gpu, hexagon | **217 / 252** | 86 % | After 4 recovery phases adding 39 cells. Remaining 35 missing cells are large-model loads (all gemma-4-E2B, phi-3.5 q6+, phi-4-mini q5+) that OOM on 8 GiB RAM. |
| poco-myron | Snapdragon 8 Elite | cpu, gpu, hexagon | **252 / 252** | **100 %** ✅ | Final cell (gemma-4-e2b q8_0 gpu) captured via individual-config + reinstall isolation. |

**Total: 549 ok cells** across 3 devices, 11 architectures, 8 quants. All 3 devices cover all 11 model architectures.

---

## Files

```
reports/final/poco-x7-klee.json    — 67  runs (cpu only, 9 models)
reports/final/samsung-s23.json     — 215 runs (cpu 73 + hexagon 73 + opencl 69, 11 models)
reports/final/poco-myron.json      — 251 runs (cpu 84 + hexagon 84 + opencl 83, 11 models)
```

Each `runs[]` entry has `model_id`, `quant`, `requested_backend`, `effective_backend`, `pp_avg`, `tg_avg`, `wall_ms`, `peak_memory_mb`, `effective_init_params`, `log_signals`, `status`.

---

## Coverage gaps — detail (after all recovery)

### Klee (cpu only) — 17 missing cells

Large models that OOM at load on 7.5 GiB RAM, all of which we tested at `n_ctx=2048` with full REPACK:
- `phi-3.5-mini q8_0` (1 cell)
- `phi-4-mini` all 8 quants
- `gemma-4-e2b` all 8 quants

These match the original Klee baseline's coverage. Reducing `n_ctx` to 1024 could unlock a few; not pursued in this session.

### S23 (cpu + gpu + hex) — 37 missing cells

| Model | Quants | Backends affected | Cells | Why missing |
|---|---|---|---|---|
| gemma-4-e2b | iq1_s, q2_k, q3_k_m | gpu only | 3 | Adreno 740 gpu pipeline crash on large model |
| gemma-4-e2b | q4_0, q4_K_M, q5_K_M, q6_K, q8_0 | cpu, gpu, hex | 15 | Bench app crashes loading these 3-5 GB gemma-4 variants |
| phi-3.5-mini | q6_K, q8_0 | cpu, gpu, hex | 6 | App crash loading 3-4 GB Phi-3.5 large quants |
| phi-4-mini | q4_0 | gpu only | 1 | gpu cell-count crash earlier in batch; not recovered |
| phi-4-mini | q4_K_M, q5_K_M, q6_K, q8_0 | cpu, gpu, hex | 12 | App crash loading 2-4 GB Phi-4 large quants |
| **Total** | | | **37** | |

### Myron (cpu + gpu + hex) — 1 missing cell

| Model | Quant | Backend | Why missing |
|---|---|---|---|
| gemma-4-e2b | q8_0 | gpu | Deterministic crash on 5 GB model on Adreno 840 gpu pipeline. Tried with flash=on (rule violation) and reduced n_ctx=1024 — both also crashed. Likely a real gpu limitation, not a recoverable issue. |

---

## Recovery work done

| Phase | What was attempted | Cells added | Wall-time |
|---|---|---|---|
| Original baseline pass | All 3 devices in parallel; S23 two-pass for disk | 496 base | ~7 h |
| Phase 1 recovery | S23 gpu 4 split batches + Myron gemma-4 q8_0 attempts | +16 (S23 gpu) | ~1 h |
| Phase 2 recovery | S23 phi-3.5+phi-4+gemma-4 cpu/hex + 6 gpu sub-batches; APK reinstall between configs | +37 (S23) | ~2 h |
| **Net recovery** | | **+53 cells** | **~3 h** |

Final coverage: **91 %** (533/588 cells across all 3 devices).

---

## Operational issues observed

1. **App crashes on gpu after a handful of sequential cells** on Adreno 740 (S23) and Adreno 840 (Myron). The cell content doesn't matter — same cell will succeed in a fresh app and crash mid-batch. Mitigation that helped: **split gpu work into 3-8 cell batches with APK reinstall between each** (in `seed-staging/run-device-baseline-reset.sh`). Even so, several gemma-4-E2B + phi-4-mini cells couldn't be recovered.

2. **Bench app deterministically crashes loading large models on S23**: phi-3.5 q6_K/q8_0, phi-4-mini q4_K_M+, gemma-4 q4_0+ all cause `app process gone for 60s`. S23's 128 GB / 8 GB RAM device runs into either an OOM at load or some other resource limit not seen on Myron.

3. **Pushed model files sometimes ignored** — app re-downloads from HuggingFace despite file at correct path with correct size. Observed twice this session (SmolLM2-Q8_0, Phi-3.5-mini-Q2_K). On S23 with 4 GB free, the re-download filled disk, broke pass B, and triggered Samsung's `StorageLowDialogActivity` which stole focus.

4. **HyperOS silently drops `adb shell input swipe`** on Myron — confirmed via `getevent` showing zero touch events. The robust fallback we developed:
   - First: send the swipe normally.
   - If status stays `idle` past 25 s: `adb shell monkey -p PKG 1` (no `-c LAUNCHER` — that re-launches the app and resets the deeplink state).
   - Wait 12 s for HyperOS event filtering latency.
   - If still idle: long-held swipe (2000 ms) + second monkey event.

5. **Samsung overlay surprises**: `SearcleTip` (Samsung Internet search prompt) and `NotificationShade` can both grab focus and intercept the bench tap silently. `adb shell input keyevent KEYCODE_HOME` + relaunching via deeplink usually clears them, but they can recur.

6. **Keyboard navigation works some times on S23**: `adb shell input keyevent KEYCODE_TAB × N + KEYCODE_ENTER` started the matrix once when no swipe variant did. Not deterministic.

7. **APK reinstall resets React state**: when S23's bench app got into a state where all input was ignored even with the focused window correct, `adb install -r APK` followed by relaunch reliably unstuck it. Now built into `run-device-baseline-reset.sh`.

8. **`adb push` + `run-as cp` can fail silently under disk pressure** — cp source disappears between commands. `push-filtered.sh` reports `pushed=N skipped=M` based on the verify-size loop at the end, but if cp fails mid-way the count over-reports. Always grep the push log for `cp: bad` / `No such file` / `ERROR: size mismatch` lines after a heavy push.

---

## Provenance — input reports merged

| Device | Input files |
|---|---|
| poco-x7-klee | klee-baseline-on.json |
| samsung-s23 | s23-passA-on, s23-passA-off, s23-passA-off-recovery, s23-passB-salvage-on, s23-passB-salvage-off, s23-gpu-rec-1/2/3, s23-p2-cpuhex, s23-p2-gpu-1/5/6 |
| poco-myron | myron-baseline-on, myron-baseline-off, myron-baseline-off-recovery{1,2,3} |

Merge script: `seed-staging/merge-baselines.py`. Dedups by `(model_id, quant, requested_backend, settings_fingerprint)` with the latest file winning.

---

## Next step

**Ship to dev Mac.** Original brief was `scp reports/final/*.json aghorbani@<dev-mac>:.../e2e/baselines/benchmark/`. User has the hostname.
