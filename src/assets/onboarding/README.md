# Onboarding illustrations

Slot directory for the seven onboarding visual assets sourced from the
canonical design file (light frame `884:28223`, dark frame `3011:25220`).

Until each asset lands on disk, the corresponding screen renders a
text placeholder (see `placeholders.ts`).

## Asset slots

| File (expected)                 | Source node | Used by              |
| ------------------------------- | ----------- | -------------------- |
| `splash-mark.png` (+@2x/@3x)    | `884:28349` | Splash + Onboarding1 |
| `screen-2-illustration.svg`     | `884:32584` | Onboarding2          |
| `screen-3-phone-card.svg`       | `885:29436` | Onboarding3 (left)   |
| `screen-3-cloud-card.svg`       | `885:29436` | Onboarding3 (right)  |
| `screen-4-shield.svg`           | `885:29601` | Onboarding4          |
| `screen-5-chip-icons/*.svg`     | `890:29650` | Onboarding5 chips    |
| `pip-mascot.svg`                | `887:30085` | Onboarding6          |

Once each asset is exported and committed, replace the matching
`placeholders.<key>` entry in the consumer screen with an `Image` /
SVG component pointing at the new asset.
