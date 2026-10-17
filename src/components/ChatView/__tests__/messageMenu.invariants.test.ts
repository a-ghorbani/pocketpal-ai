import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'ChatView.tsx'),
  'utf8',
);

const between = (start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
};

const callsOf = (text: string, setter: string) =>
  text.match(new RegExp(`\\b${setter}\\(`, 'g'))?.length ?? 0;

describe('the message menu has one opener and one closer', () => {
  const opener = between('const openMessageMenu =', 'const handleMenuDismiss');
  const closer = between('const handleMenuDismiss =', 'const keyExtractor');

  it.each([
    ['setMenuVisible', 1, 1],
    ['setSelectedMessage', 1, 1],
    ['setMenuPosition', 1, 0],
  ])(
    '%s is written only by openMessageMenu and handleMenuDismiss',
    (setter, inOpener, inCloser) => {
      expect(callsOf(opener, setter)).toBe(inOpener);
      expect(callsOf(closer, setter)).toBe(inCloser);
      expect(callsOf(source, setter)).toBe(inOpener + inCloser);
    },
  );

  it('passes openMessageMenu to every row as its only menu trigger', () => {
    expect(source).toContain('onMessageMenuPress: openMessageMenu');
    expect(source).not.toMatch(/onMessageLongPress|onLongPress/);
  });
});
