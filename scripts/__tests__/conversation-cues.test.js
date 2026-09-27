const fs = require('fs');
const path = require('path');

const native = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'android/app/src/main/java/com/pocketpalai/SpeechRecognitionModule.kt',
  ),
  'utf8',
);

describe('Android conversation turn cue contract', () => {
  it('uses two full distinct patterns on the media stream', () => {
    expect(native).toMatch(
      /"narrationEnded"\s*->\s*\{[\s\S]*?TONE_PROP_PROMPT[\s\S]*?durationMs = 200/,
    );
    expect(native).toMatch(
      /"listeningEnded"\s*->\s*\{[\s\S]*?TONE_PROP_BEEP2[\s\S]*?durationMs = 270/,
    );
    expect(native).toContain('ToneGenerator(AudioManager.STREAM_MUSIC, 45)');
    expect(native).toContain('mainHandler.postDelayed(it, durationMs + 40L)');
  });

  it('suppresses silent, muted, interrupted and active-recognizer cues', () => {
    expect(native).toContain('activeRequestId != null');
    expect(native).toContain(
      'audio.ringerMode != AudioManager.RINGER_MODE_NORMAL',
    );
    expect(native).toContain('audio.isStreamMute(AudioManager.STREAM_MUSIC)');
    expect(native).toContain(
      'audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0',
    );
    expect(native).toContain(
      'notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL',
    );
    expect(native).toContain('finishTurnCue(false)');
  });
});
