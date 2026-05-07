const SERVICE_TOKEN_PATTERNS: RegExp[] = [
  /<\|begin_of_text\|>/g,
  /<\|end_of_text\|>/g,
  /<\|eot_id\|>/g,
  /<\|im_start\|>/g,
  /<\|im_end\|>/g,
  /<\|assistant\|>/g,
  /<\|user\|>/g,
  /<\|system\|>/g,
  /<\|start_header_id\|>/g,
  /<\|end_header_id\|>/g,
  /<\|channel\|?>\s*(analysis|thought|final)?/gi,
  /\[\/?INST\]/g,
  /<\/?s>/g,
  /<\/?(bos|eos)>/gi,
];

const SERVICE_TOKEN_RE = new RegExp(
  SERVICE_TOKEN_PATTERNS.map(pattern => pattern.source).join('|'),
  'gi',
);

export function hasServiceTokens(text: string): boolean {
  SERVICE_TOKEN_RE.lastIndex = 0;
  return SERVICE_TOKEN_RE.test(text);
}

export function stripServiceTokens(text: string): string {
  return text
    .replace(SERVICE_TOKEN_RE, '')
    .replace(/^\s*(assistant|user|system)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function findServiceToken(text: string, fromIndex: number) {
  SERVICE_TOKEN_RE.lastIndex = fromIndex;
  const match = SERVICE_TOKEN_RE.exec(text);
  if (!match) {
    return undefined;
  }

  return {
    index: match.index,
    raw: match[0],
  };
}
