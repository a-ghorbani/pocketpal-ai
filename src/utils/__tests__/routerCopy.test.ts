import {routerFailureLabel, routerFailureText} from '../routerCopy';
import {l10n} from '../../locales';

const en = l10n.en;

describe('routerFailureText', () => {
  it('says nothing where the operation left no record', () => {
    expect(routerFailureText(undefined, en)).toBeUndefined();
  });

  it('renders the cause alone where the server gave no words', () => {
    expect(routerFailureText({cause: 'load-failed'}, en)).toBe(
      en.settings.routerModels.loadFailed,
    );
  });

  // The server's words reach a markdown-rendered chat bubble, so its
  // formatting characters would be read as markup rather than shown.
  it('renders the server words as plain text', () => {
    expect(
      routerFailureText(
        {cause: 'load-failed', message: '**boom** `rm -rf` [link](x)'},
        en,
      ),
    ).toBe(`${en.settings.routerModels.loadFailed} boom rm -rf linkx`);
  });

  it('collapses a multi-line body onto one line', () => {
    expect(
      routerFailureText({cause: 'load-failed', message: 'a\n\nb\tc'}, en),
    ).toBe(`${en.settings.routerModels.loadFailed} a b c`);
  });

  it('caps a body that would otherwise be the whole turn', () => {
    const text = routerFailureText(
      {cause: 'load-failed', message: 'x'.repeat(5000)},
      en,
    )!;

    expect(text.length).toBe(en.settings.routerModels.loadFailed.length + 201);
  });

  it('falls back to the cause where nothing survives the strip', () => {
    expect(routerFailureText({cause: 'load-failed', message: '***'}, en)).toBe(
      en.settings.routerModels.loadFailed,
    );
  });
});

describe('routerFailureLabel', () => {
  it('has copy for the wait this app stopped itself', () => {
    expect(routerFailureLabel('wait-stopped', en)).toBe(
      en.settings.routerModels.waitStopped,
    );
  });
});
