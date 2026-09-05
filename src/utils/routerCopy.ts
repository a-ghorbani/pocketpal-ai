import type {Translations} from '../locales/types';
import type {RouterFailure} from './routerState';

/**
 * The one rendering of a router failure, shared by the picker row and the
 * chat: two wordings for one record read as two things having gone wrong.
 */
export const routerFailureLabel = (
  cause: RouterFailure['cause'],
  l10n: Translations,
): string => {
  switch (cause) {
    case 'load-failed':
      return l10n.settings.routerModels.loadFailed;
    case 'unload-not-released':
      return l10n.settings.routerModels.unloadNotReleased;
    case 'download-not-fetched':
      return l10n.settings.routerModels.downloadNotFetched;
    case 'server-unreachable':
      return l10n.settings.routerModels.serverUnreachable;
    case 'wait-stopped':
      return l10n.settings.routerModels.waitStopped;
  }
};

/**
 * Everything a surface may need from one failure record. The picker row shows
 * these in a plain `<Text>`; the chat renders markdown, so it takes the
 * neutralised form below.
 */
export const routerFailureText = (
  failure: RouterFailure | undefined,
  l10n: Translations,
): string | undefined => {
  if (!failure) {
    return undefined;
  }
  const label = routerFailureLabel(failure.cause, l10n);
  return failure.message ? `${label} ${failure.message}` : label;
};

/**
 * Direction and isolate controls, and the zero-width characters that hide
 * beside them. JavaScript's `\s` matches none of these, so a collapse of
 * whitespace leaves them in place to reorder what the user reads.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Everything `marked` gives meaning to, plus `:` — which is not markup, but
 * without which GFM autolinks a bare `https://…` into a tappable `<a href>`
 * that `Linking.openURL` will open. Escaping rather than deleting keeps the
 * characters on screen: a model identifier like `Q4_K_M` or a Windows path
 * survives intact, which stripping did not.
 */
const MARKDOWN_ACTIVE = /[\\`*_{}[\]()#+\-.!|>~<&:]/g;

/**
 * The server's own words rendered inert for a markdown surface. They are not
 * ours and carry no contract, so they arrive as one line of text that formats
 * nothing, links to nothing and reorders nothing.
 */
export const asInertServerText = (text: string): string =>
  text
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(MARKDOWN_ACTIVE, match => `\\${match}`);

/** The same record, safe to hand to a markdown renderer. */
export const routerFailureMarkdownText = (
  failure: RouterFailure | undefined,
  l10n: Translations,
): string | undefined => {
  if (!failure) {
    return undefined;
  }
  const label = routerFailureLabel(failure.cause, l10n);
  const detail = failure.message ? asInertServerText(failure.message) : '';
  return detail ? `${label} ${detail}` : label;
};
