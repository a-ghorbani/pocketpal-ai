const fs = require('fs');
const path = require('path');

const manifest = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'android',
    'app',
    'src',
    'main',
    'AndroidManifest.xml',
  ),
  'utf8',
);
const mainActivity = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'pocketpalai',
    'MainActivity.kt',
  ),
  'utf8',
);

const tags = name =>
  [...manifest.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(
    match => match[0],
  );

const hasAttributes = (tag, attributes) =>
  Object.entries(attributes).every(([name, value]) =>
    new RegExp(`\\b${name}\\s*=\\s*["']${value}["']`).test(tag),
  );

const findTag = (name, attributes) =>
  tags(name).find(tag => hasAttributes(tag, attributes));

describe('Android hardware declarations', () => {
  it('keeps on-device speech discovery and microphone access', () => {
    expect(
      findTag('action', {
        'android:name': 'android.speech.RecognitionService',
      }),
    ).toBeDefined();
    expect(
      findTag('uses-permission', {
        'android:name': 'android.permission.RECORD_AUDIO',
      }),
    ).toBeDefined();
  });

  describe('Android voice chat launcher', () => {
    it('keeps a distinct exported launcher alias targeting MainActivity', () => {
      expect(
        findTag('activity-alias', {
          'android:name': '.VoiceChatActivity',
          'android:targetActivity': '.MainActivity',
          'android:label': '@string/voice_chat_app_name',
          'android:enabled': 'false',
          'android:exported': 'true',
        }),
      ).toBeDefined();
    });

    it('normalizes alias launches to the scoped assistant route', () => {
      expect(mainActivity).toContain(
        'private const val VOICE_CHAT_ALIAS = ".VoiceChatActivity"',
      );
      expect(mainActivity).toContain(
        'private const val VOICE_CHAT_URL = "pocketpal://assistant/new-chat"',
      );
      expect(mainActivity).toContain(
        'setIntent(normalizeVoiceChatIntent(intent))',
      );
      expect(mainActivity).toContain(
        'val normalizedIntent = normalizeVoiceChatIntent(intent)',
      );
    });

    it('resets the launcher disabled when the app process starts', () => {
      const mainApplication = fs.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          'android',
          'app',
          'src',
          'main',
          'java',
          'com',
          'pocketpalai',
          'MainApplication.kt',
        ),
        'utf8',
      );
      expect(mainApplication).toContain(
        'VoiceChatLauncher.setEnabled(this, false)',
      );
      expect(mainApplication).toContain('add(VoiceChatLauncherPackage())');
    });
  });

  it.each(['android.hardware.camera', 'android.hardware.camera.any'])(
    'declares %s as optional',
    feature => {
      expect(
        findTag('uses-feature', {
          'android:name': feature,
          'android:required': 'false',
        }),
      ).toBeDefined();
    },
  );
});
