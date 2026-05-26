# Designer asks — onboarding copy

Per HOW Step 6 (§9m fallback): empty Figma string slots are logged here
and ship as empty strings in `src/locales/en.json` until copy lands. The
testID-bearing surfaces still render — only the visible body text is
empty.

Format: screen # / l10n key / Figma node id (canonical file
`RZxDJea4t6jnBZrV4YBacF`).

| Screen | Key | Figma node | Status |
| --- | --- | --- | --- |
| Splash | `onboarding.splash.title` | `884:28349` (optional brand subtitle) | empty in en.json |
| 1 | `onboarding.screen1.body` | descendant of `884:28223` screen-1 body block | empty in en.json |
| 2 | `onboarding.screen2.body` | descendant of `884:28223` screen-2 body block | empty in en.json |
| 3 | `onboarding.screen3.body` | descendant of `884:28223` screen-3 body block | empty in en.json |
| 4 | `onboarding.screen4.body` | descendant of `884:28223` screen-4 body block | empty in en.json |

Eyebrows + titles + CTAs for screens 1–4 are present (sourced from
`what.md` §3 state-machine table + §4j contract, both of which reference
the canonical frames verbatim). Bodies are explicitly designer-owned in
§4j and are not invented here.

Pickup path: copy lands via a follow-up PR (or Weblate edit for `en.json`
once a future translation lands first) — non-blocking for the slice.
