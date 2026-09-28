# 002: Hands-free conversation turn cues

**Status:** Accepted

## Context

Hands-free conversation already supersedes one-shot dictation under
[FD-003](001-sync-upstream-6cf3944.md#fd-003-hands-free-conversation-supersedes-one-shot-dictation).
Users also need an audio-only indication of when captured speech has become a
request and when narration has fully completed, particularly when they cannot
see the screen.

**Fork history:** `488a3a7`, `9ec6a3a`

## Decision

Preserve distinct Android media-channel cues for successful hands-free turn
transitions:

- a double blip after speech is captured and listening has stopped, completed
  before the request is sent; and
- a single blip after successful narration fully drains, completed before the
  microphone restarts.

Cues follow media volume and output routing, like narration. Muted media
suppresses them, but ringer silence, vibration mode, and Do Not Disturb do not.
Silence retries, recognition errors, skipped or failed narration, cancellation,
and background transitions must not produce misleading cues. Existing
foreground, recognizer, completion, and cancellation guards remain in force so
the recognizer cannot capture a cue.

Explicit PCM patterns are part of the Android contract; device-dependent
proprietary system tones are not an acceptable substitute.

## Affected paths

- `android/app/src/main/java/com/pocketpalai/SpeechRecognitionModule.kt`
- `src/specs/NativeSpeechRecognition.ts`
- `src/services/conversationCues.ts`
- `src/hooks/useVoiceConversation.ts`
- `src/hooks/useChatSession.ts`
- `src/services/tts/engines/system/index.ts`
- `src/store/TTSStore.ts`
- speech, conversation, TTS, native-contract, and user documentation tests

## Rejected alternatives

- Visual-only state changes do not serve screen-free use.
- Ringer- or notification-channel tones can disappear in silent/DND modes even
  while spoken narration remains audible.
- Starting recognition before a cue completes risks recognizing the app's own
  audio.
- Playing cues for silence, failed narration, skips, or cancellation falsely
  signals a completed turn transition.

## Preservation checks

Run the focused conversation-cue, voice-conversation, chat-session, system-TTS,
TTS-store, and Android native-contract tests. Android builds and emulator smoke
tests do not establish audible timing or routing. Physical-device acceptance on
Android 12 or newer must cover media mute and volume, silent/vibrate/DND modes,
system and neural voices, cancellation, skip, backgrounding, and wired or
Bluetooth output.

## Superseded when

A later approved hands-free UX provides equivalent nonvisual turn boundaries,
prevents recognizer feedback, and has physical-device acceptance coverage.
