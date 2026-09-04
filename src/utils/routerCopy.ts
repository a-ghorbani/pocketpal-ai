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

/** No record, nothing to say: an operation may end without an outcome. */
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
