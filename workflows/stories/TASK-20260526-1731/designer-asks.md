# Designer asks — onboarding

After the Round-3 Figma-faithful retrofit (PR #747), the only remaining
designer ask is:

1. **Audio button announcement intent (D14)** — Screens 5 + 6 carry a
   small headphones-style IconButton (top-right) that, on press, calls
   `AccessibilityInfo.announceForAccessibility(<title> + " " + <body>)`.
   Confirm whether `title + body` is the desired announcement, or
   specify alternate copy / an actual TTS engine.

All earlier "body copy pending" / "title pending" entries are obsolete:
bodies, titles, CTAs, and highlight phrases are filled verbatim from the
canonical Figma file `RZxDJea4t6jnBZrV4YBacF` (light frame `884:28223`,
dark frame `3011:25220`).
