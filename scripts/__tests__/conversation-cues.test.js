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
  it('uses two explicit distinct PCM patterns on the media stream', () => {
    expect(native).toMatch(
      /"narrationEnded"\s*->\s*listOf\(ToneSegment\(880\.0, 150\)\)/,
    );
    expect(native).toMatch(
      /"listeningEnded"\s*->\s*listOf\([\s\S]*?ToneSegment\(1046\.5, 90\),[\s\S]*?ToneSegment\(0\.0, 55\),[\s\S]*?ToneSegment\(1318\.5, 105\)/,
    );
    expect(native).toContain('.setUsage(AudioAttributes.USAGE_MEDIA)');
    expect(native).toContain('.setTransferMode(AudioTrack.MODE_STATIC)');
    expect(native).toContain('CUE_AMPLITUDE = 0.7');
    expect(native).toContain(
      'mainHandler.postDelayed(it, cueAudio.durationMs + CUE_COMPLETION_GRACE_MS)',
    );
  });

  it('suppresses unavailable media and active-recognizer cues', () => {
    expect(native).toContain('activeRequestId != null');
    expect(native).toContain('audio.isStreamMute(AudioManager.STREAM_MUSIC)');
    expect(native).toContain(
      'audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0',
    );
    expect(native).not.toContain('audio.ringerMode');
    expect(native).not.toContain('currentInterruptionFilter');
    expect(native).toContain('finishTurnCue(false)');
  });
});
