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
