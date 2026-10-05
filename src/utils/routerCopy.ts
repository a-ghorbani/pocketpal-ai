import type {Translations} from '../locales/types';
import type {RouterFailure} from '../store/routerVerdicts';

/**
 * The one wording of a router failure, shared by the picker row, the chat
 * banner and the chat message: two wordings for one ending would read as two
 * things having gone wrong.
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
    case 'server-unreachable':
      return l10n.settings.routerModels.serverUnreachable;
    case 'wait-stopped':
      return l10n.settings.routerModels.waitStopped;
  }
};
