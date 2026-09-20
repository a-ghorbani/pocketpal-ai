# 001: Merge upstream `6cf3944` into conversation mode

**Status:** Accepted

## Revisions

- Merge base: `6683a28876d031484cc72dde251b6139a804ad64`
- Fork tip: `1dac28e44cb85eff54a794ee570b6efcbed4eaf9`
- Upstream tip: `6cf3944a47a196d2a68b1ba05d2534bd0ec20dd5`

The incoming range contains upstream locale-registry synchronization, responsive
Pal-card layout, and camera-availability handling. The fork range contains
intentional product and protocol behavior that does not exist upstream.

## Permanent fork invariants

### FD-001: Centralized integrations remain disabled

**Affected paths:** build configuration, native autolinking, PalsHub services,
deep links, sidebar, feedback, and benchmark submission.

**Fork history:** `814527b`, `3aabf89`

Normal fork builds must not initialize Firebase, Google Sign-In, or centralized
PalsHub account, marketplace, checkout, synchronization, feedback, or benchmark
submission. User-owned Hugging Face, search-provider, and remote-server
credentials remain supported.

**Decision:** Keep the existing compile-time, runtime, UI, and native-linking
gates. Retained upstream packages or source behind those gates do not enable the
integrations.

**Rejected:** Removing all credential support would break user-owned services.
Taking upstream defaults would restore centralized integrations.

**Preservation checks:** disabled-build Jest lane and React Native configuration
inspection with centralized integrations disabled.

**Superseded when:** the fork explicitly adopts a different privacy/product
policy with corresponding native and runtime acceptance coverage.

### FD-002: GitHub Copilot and Responses compatibility remain additive

**Affected paths:** remote server/model settings, completion APIs, Responses
transport and diagnostics, protocol/catalog helpers, stores, persistence, and
deterministic E2E fixtures.

**Fork history:** `59adaa1`, `f4b27ec` through `316f939`, `15cc17d`

**Decision:** Preserve GitHub Copilot as an opt-in server type with unversioned
paths, required client headers, Auto/Chat Completions/Responses routing,
generation-parameter omission modes, terminal item reconciliation, restart
persistence, tool replay, and content-safe opt-in diagnostics. Preserve the
credential-origin safeguards added by `da1da43`.

**Rejected:** Replacing fork transports or stores wholesale with upstream would
remove supported protocol behavior and could send saved credentials to an
edited server origin.

**Preservation checks:** focused API, protocol, store, repository, settings, and
fixture tests, followed by the Android E2E workflow.

**Superseded when:** equivalent upstream support covers the same contracts and
migration behavior.

### FD-003: Hands-free conversation supersedes one-shot dictation

**Affected paths:** Android speech module/package/spec and manifest,
`useSpeechRecognition`, `useVoiceConversation`, ChatInput/ChatView, TTS, mocks,
localization, and documentation.

**Fork history:** `8cf01fb`, superseded in behavior by `1dac28e`

**Decision:** Preserve explicitly on-device recognition without cloud fallback,
foreground and context guards, automatic final-transcript sending, silence
retry, new-chat handoff, TTS drain coordination, microphone cancellation, and
the separate audio-only skip control.

**Rejected:** Restoring the earlier manual-send dictation UX would regress the
current branch even though it appears in fork history.

**Preservation checks:** speech-recognition, voice-conversation, ChatInput,
ChatView, and TTS tests. Native recognition and audio turn-taking still require
physical-device acceptance outside this merge gate.

**Superseded when:** a later approved voice UX replaces conversation mode.

### FD-004: Scout and full-result search remain local fork features

**Affected paths:** Pal store and UI, talents, themes, search provider store,
search budgeting/cache, settings, and documentation.

**Fork history:** `35f7dbc`, `9cf514a`, `03fa316`

**Decision:** Keep idempotent Scout seeding, its five talents, selective warm
palette migration and contrast behavior. Keep the 20-result maximum, persisted
default-on full-results option, bounded mode, and mode-separated caching.

**Rejected:** Treating upstream Pal layout as permission to replace fork Pal
behavior, or reverting search limits while resolving unrelated UI changes.

**Preservation checks:** Pal grid/card/store/theme tests and search store,
provider, budget, talent, and settings tests.

**Superseded when:** upstream provides equivalent behavior and compatible state
migration.

## Merge-specific resolutions

### MR-001: Android microphone and optional cameras coexist

**Affected path:** `android/app/src/main/AndroidManifest.xml`

Upstream makes camera hardware optional so devices without cameras can install
and launch the app. The fork declares audio recording and speech-recognition
service visibility for on-device conversation. Both are independent.

**Decision:** Retain the speech recognition query and `RECORD_AUDIO` permission,
then add both upstream camera feature declarations with
`android:required="false"`.

**Rejected:** Choosing either conflict side would remove a required feature.

**Preservation checks:** static manifest contract test and the Android E2E build.

### MR-002: Camera handling is composed with conversation controls

**Affected paths:** `src/components/ChatInput/ChatInput.tsx` and its tests,
`EmbeddedVideoView`, and the vision-camera mock.

**Decision:** Accept upstream no-camera and generic camera alerts, fallback
device selection, accessible close controls, and cleanup tests while retaining
fork conversation state, recognition eligibility, drafts, images, settings,
and Pal-surface contrast.

**Rejected:** Replacing ChatInput with either parent's complete file would lose
behavior from the other parent.

**Preservation checks:** camera, EmbeddedVideoView, ChatInput, dictation, and
voice-conversation test suites.

### MR-003: Responsive Pal layout retains fork Pal semantics

**Affected paths:** PalsScreen, PalGridRow, SquarePalCard, styles, and tests.

**Decision:** Accept upstream row chunking and responsive card sizing. Preserve
local Scout rendering, thumbnail contrast, custom records, and disabled PalsHub
entry points.

**Rejected:** Keeping the fixed two-column layout would discard the upstream
fix; replacing fork tests would lose Scout regression coverage.

**Preservation checks:** Pal screen/grid/row/card and PalStore tests.

### MR-004: Locale registry checks do not alter fork product policy

**Affected paths:** locale validation and synchronization scripts and tests,
locale registry tests, and UIStore tests.

**Decision:** Accept upstream's shared registry-language extraction and drift
checks. Preserve fork English strings and fallback behavior. Do not invoke
network Weblate synchronization as part of the merge.

**Rejected:** Replacing locale content from a remote translation service is
outside this pinned source merge and would make validation non-reproducible.

**Preservation checks:** localization validation and incoming script/locale
tests.

## Acceptance boundary

Local validation covers static contracts, unit/integration tests, type checking,
linting, disabled native autolinking, and deterministic remote fixtures. Final
acceptance additionally requires a fresh successful
`.github/workflows/e2e-tests.yml` run whose head SHA is the final pushed commit.

That workflow does not establish live GitHub Copilot service compatibility,
physical-device speech/TTS turn-taking, real provider-backed search, camera
hardware coverage, or iOS runtime behavior.
