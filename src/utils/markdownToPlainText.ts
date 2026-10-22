const FENCE = /^\s*(```|~~~)/;

const inlineToPlain = (line: string): string =>
  line
    .replace(/^\s{0,3}(>\s?)+/, '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]]\s+)?/, '')
    .replace(/!?\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, '$1$2');

/** Rendered-looking text of a markdown message, for a screen-reader label. */
export const markdownToPlainText = (markdown: string): string => {
  let inFence = false;
  return markdown
    .split('\n')
    .map(line => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? line : inlineToPlain(line);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};
