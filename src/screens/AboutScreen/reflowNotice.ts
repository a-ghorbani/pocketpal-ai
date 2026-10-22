const OWN_LINE =
  /^\s*(#|```|[*-]\s|\d+\.\s|Copyright\b|Apache License\s*$|Version \d+\.\d+, |https?:\/\/\S+\s*$)/;
const ENDS_BLOCK = /^\s*(#|```)/;

/**
 * Joins hard-wrapped lines of a paragraph with spaces so the text wraps to
 * the screen. Blank lines, headings, code fences, list items, Copyright
 * lines, bare URLs and the Apache License title and version lines stay on
 * their own lines. CRLF line endings are read as LF.
 */
export function reflowNotice(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const prev = lines[lines.length - 1];
    const startsNewLine =
      prev === undefined ||
      prev.trim() === '' ||
      line.trim() === '' ||
      OWN_LINE.test(line) ||
      ENDS_BLOCK.test(prev);
    if (startsNewLine) {
      lines.push(line);
    } else {
      lines[lines.length - 1] = `${prev} ${line.trim()}`;
    }
  }
  return lines.join('\n');
}
