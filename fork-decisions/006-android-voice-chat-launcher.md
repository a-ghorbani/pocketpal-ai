# 006: Launch a fresh hands-free chat from Android

**Status:** Accepted

## Context

Hands-free conversation is an intentional fork feature under
[FD-003](001-sync-upstream-6cf3944.md#fd-003-hands-free-conversation-supersedes-one-shot-dictation),
and explicit cold-start model and Pal choices are preserved by
[003](003-startup-selection-restoration.md). Android users also need a direct
launcher entry that can begin a new hands-free conversation without turning
ordinary app launches into voice sessions or changing those remembered
choices.

The launcher is a private-build fallback for opening PocketPal by name. It is
not a Google Play App Action, an Android Auto integration, or permission to
bypass Android's restrictions on app launches while driving.

**Fork history:** `68619e1`

## Decision

Preserve the separate Android **PocketPal Voice Chat** activity alias. Keep the
alias disabled until the app has a loaded model engine and is not loading model
context, so Android does not advertise a launcher that cannot begin a
conversation.

Normalize both cold and warm alias launches to the internal
`pocketpal://assistant/new-chat` route. A valid request resets the active
session, navigates to a fresh chat with the currently selected Pal and model,
and starts hands-free conversation only after startup selection restoration
and chat-input readiness permit it. Resetting the session or handling the
request must not rewrite the remembered startup model, Pal, or explicit
`No Pal` preference.

Treat every launch as a bounded, single-use request:

- reject it before resetting the chat when no usable model engine is ready,
  model context is loading, the selected Pal requires video, or generation is
  active or stopping;
- do not leave rejected requests queued to activate later;
- consume the request after conversation starts, if conversation is already
  active, or when readiness is lost;
- clear it when the app backgrounds, the chat input unmounts, or the user
  manually controls conversation mode; and
- use request identity so stale cleanup cannot consume a newer launch.

Clear draft text and selected images before automatic listening begins. A
launcher request must not interrupt an active generation or a conversation the
user started manually.

## Affected paths

- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/pocketpalai/MainActivity.kt`
- `android/app/src/main/java/com/pocketpalai/MainApplication.kt`
- `android/app/src/main/java/com/pocketpalai/VoiceChatLauncherModule.kt`
- `android/app/src/main/java/com/pocketpalai/VoiceChatLauncherPackage.kt`
- `src/specs/NativeVoiceChatLauncher.ts`
- `src/services/voiceChatLauncher.ts`
- `src/hooks/useDeepLinking.ts`
- `src/store/DeepLinkStore.ts`
- `src/components/ChatInput/ChatInput.tsx`
- Android manifest, deep-link, store, and ChatInput dictation tests
- English localization and getting-started documentation

## Rejected alternatives

- Enabling the alias permanently would advertise voice chat before a model can
  serve it and create launch requests that may activate unexpectedly later.
- Starting conversation directly in native Android code would bypass startup
  restoration, Pal capabilities, generation state, React navigation, and the
  existing conversation guards.
- Persisting a pending request across backgrounding or navigation changes
  would allow stale user intent to start the microphone later.
- Reusing the current session would mix an explicit new voice interaction with
  prior conversation state.
- Treating the launcher as Android Auto or Assistant platform integration would
  promise capabilities this private, sideloaded application does not have.

## Preservation checks

Run the focused deep-link hook, deep-link store, ChatInput dictation, and
Android manifest contract tests. Cover cold and warm intent normalization,
dynamic alias enablement, new-session routing, preservation of remembered
selections, startup and model readiness, active-generation rejection, video
Pal rejection, single-use request identity, manual-control ownership,
background and unmount cleanup, and draft or image clearing.

An Android build and emulator launch can establish manifest registration,
native-module wiring, and basic routing. They do not establish Google Assistant
launch permission, Android Auto availability, physical-device microphone
behavior, or safe use while driving.

## Superseded when

A later approved Android entry-point or platform integration provides an
equivalent fresh hands-free launch while preserving explicit startup choices,
eligibility checks, lifecycle cancellation, single-use request ownership, and
the existing on-device conversation safeguards.
