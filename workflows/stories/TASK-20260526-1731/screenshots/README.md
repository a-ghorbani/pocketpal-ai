# Visual captures

Per HOW Step 10 and FOU-112-rollout §5: per-screen light + dark captures
on iOS sim + Android emulator are required for the pipeline-reviewer's
visual diff against canonical Figma frames `884:28223` (light) and
`3011:25220` (dark).

Slots (12 + 2 RTL):

| File | Source frame |
| --- | --- |
| `splash-light.png` | `884:28349` |
| `splash-dark.png` | `884:28349` (dark binding) |
| `onboarding-1-light.png` | `884:28223` screen 1 |
| `onboarding-1-dark.png` | `3011:25220` screen 7 |
| `onboarding-2-light.png` | `884:28223` screen 2 |
| `onboarding-2-dark.png` | `3011:25220` screen 8 |
| `onboarding-3-light.png` | `884:28223` screen 3 |
| `onboarding-3-dark.png` | `3011:25220` screen 9 |
| `onboarding-4-light.png` | `884:28223` screen 4 |
| `onboarding-4-dark.png` | `3011:25220` screen 10 |
| `onboarding-5-light.png` | `884:28223` screen 5 |
| `onboarding-5-dark.png` | `3011:25220` screen 11 |
| `onboarding-5-rtl-he.png` | `884:28223` screen 5 (mirrored) |
| `onboarding-6-light.png` | `884:28223` screen 6 |
| `onboarding-6-dark.png` | `3011:25220` screen 12 |
| `onboarding-6-rtl-he.png` | `884:28223` screen 6 (mirrored) |

Procedure: identical to FOU-114's
`workflows/stories/TASK-20260519-2110/visual-diff-procedure.md`. Drive
the running iOS sim / Android emu by hand through the flow; flip
colorScheme via OS settings between captures; switch to `he` locale for
the RTL slots.

Captures are placed here by the implementer (or pipeline-reviewer) and
diffed by eye against the canonical Figma frames.
