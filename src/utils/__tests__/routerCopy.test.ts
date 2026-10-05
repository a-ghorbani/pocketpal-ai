import {routerFailureLabel} from '../routerCopy';
import {l10n} from '../../locales';

const en = l10n.en;

describe('routerFailureLabel', () => {
  it.each([
    ['load-failed', en.settings.routerModels.loadFailed],
    ['unload-not-released', en.settings.routerModels.unloadNotReleased],
    ['server-unreachable', en.settings.routerModels.serverUnreachable],
    ['wait-stopped', en.settings.routerModels.waitStopped],
  ] as const)('words %s as the app sentence for it', (cause, sentence) => {
    expect(routerFailureLabel(cause, en)).toBe(sentence);
  });

  it('gives each cause its own sentence', () => {
    const causes = [
      'load-failed',
      'unload-not-released',
      'server-unreachable',
      'wait-stopped',
    ] as const;
    const sentences = causes.map(cause => routerFailureLabel(cause, en));
    expect(new Set(sentences).size).toBe(causes.length);
  });
});
