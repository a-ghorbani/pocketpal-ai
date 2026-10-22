export const CONTROL_CHARACTERS = ['\u0000', '\u001f', '\u007f'];

const codePoint = (c: string) =>
  `<U+${c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}>`;

/** `[printable form, value]` rows, one per control character and built value. */
export const withEachControl = (
  build: (c: string) => string[],
): [string, string][] =>
  CONTROL_CHARACTERS.flatMap(c =>
    build(c).map((value): [string, string] => [
      value.split(c).join(codePoint(c)),
      value,
    ]),
  );
