export const REDACTED = '[redacted]';

/**
 * Replace every stored secret, and its percent-encoded form, wherever a server
 * echoes it back. Applied to pipeline output and to every error message, since
 * both can reach the screen. Every stored value is at least four characters
 * (the store enforces it), so there is no short-value exception here.
 */
export function redact(text: string, secretValues: Iterable<string>): string {
  const forms = new Set<string>();
  for (const value of secretValues) {
    if (!value) {
      continue;
    }
    forms.add(value);
    forms.add(encodeURIComponent(value));
  }

  // Longest first, so a value that contains another cannot leave a fragment.
  const ordered = [...forms].sort((a, b) => b.length - a.length);
  let output = text;
  for (const form of ordered) {
    output = output.split(form).join(REDACTED);
  }
  return output;
}
