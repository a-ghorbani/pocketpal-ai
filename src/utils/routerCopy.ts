import type {Translations} from '../locales/types';
import type {RouterFailure, RouterLoadOutcome} from './routerState';

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
 * Every character that occupies no space and can reorder or hide what follows
 * it: Unicode's whole format class, where the direction and isolate controls
 * live, plus the four filler letters that are not formatting but render as
 * nothing. JavaScript's `\s` matches none of them, so collapsing whitespace
 * leaves them in place.
 */
const INVISIBLE = /[\p{Cf}ᅟᅠㅤﾠ]/gu;

/**
 * Everything `marked` gives meaning to, plus `:` — which is not markup, but
 * without which GFM autolinks a bare `https://…` into a tappable `<a href>`
 * that `Linking.openURL` will open. Escaping rather than deleting keeps the
 * characters on screen: a model identifier like `Q4_K_M` or a Windows path
 * survives intact, which stripping did not.
 *
 * `.` carries a second job that its neighbours do not: it is what defeats the
 * URL pattern `ParsedText` matches on the link-preview path, which does not
 * go through `marked` at all. That path is unreachable while the chat screen
 * passes no `onPreviewDataFetched`, so removing `.` here would look harmless
 * and would arm it.
 */
const MARKDOWN_ACTIVE = /[\\`*_{}[\]()#+\-.!|>~<&:]/g;

/**
 * One line, with nothing in it that can hide or reorder the rest. Every
 * surface needs this much; only a markdown one needs the escaping below.
 */
const asOneVisibleLine = (text: string): string =>
  text.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();

/**
 * The server's own words rendered inert for a markdown surface. They are not
 * ours and carry no contract, so they arrive as one line of text that formats
 * nothing, links to nothing and reorders nothing.
 */
export const asInertServerText = (text: string): string =>
  asOneVisibleLine(text).replace(MARKDOWN_ACTIVE, match => `\\${match}`);

/**
 * The app's own sentence, then the server's words as something quoted rather
 * than said. The bubble is authored by the assistant, so words run together
 * with the app's read as the app's own.
 */
const withServerWords = (label: string, detail: string): string =>
  detail ? `${label} “${detail}”` : label;

/**
 * What a surface that renders no markup shows — the picker row's plain text
 * node. The words are kept as the server wrote them, so identifiers survive,
 * but nothing invisible comes with them.
 */
export const routerFailureText = (
  failure: RouterFailure | undefined,
  l10n: Translations,
): string | undefined => {
  if (!failure) {
    return undefined;
  }
  return withServerWords(
    routerFailureLabel(failure.cause, l10n),
    failure.message ? asOneVisibleLine(failure.message) : '',
  );
};

/** The same record, safe to hand to a markdown renderer. */
export const routerFailureMarkdownText = (
  failure: RouterFailure | undefined,
  l10n: Translations,
): string | undefined => {
  if (!failure) {
    return undefined;
  }
  return withServerWords(
    routerFailureLabel(failure.cause, l10n),
    failure.message ? asInertServerText(failure.message) : '',
  );
};

/**
 * Whether a turn may proceed, and what to say if not. One exhaustive reading
 * of the outcome: a surface branches on the answer rather than re-deriving a
 * withdrawal from the absence of a record.
 */
export type RouterReadiness =
  | {proceed: true}
  | {proceed: false; withdrawn: true}
  | {proceed: false; withdrawn: false; say: string};

export const routerReadiness = (
  outcome: RouterLoadOutcome,
  failure: RouterFailure | undefined,
  l10n: Translations,
): RouterReadiness => {
  switch (outcome) {
    case 'ready':
    case 'not-router':
      return {proceed: true};
    case 'withdrawn':
      return {proceed: false, withdrawn: true};
    case 'failed':
      return {
        proceed: false,
        withdrawn: false,
        say:
          routerFailureMarkdownText(failure, l10n) ??
          routerFailureLabel('wait-stopped', l10n),
      };
  }
};
