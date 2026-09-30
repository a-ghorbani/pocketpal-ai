import {marked} from 'marked';

import {
  asInertServerText,
  routerFailureLabel,
  routerFailureMarkdownText,
  routerFailureText,
} from '../routerCopy';
import {capServerText} from '../../api/router';
import {l10n} from '../../locales';

const en = l10n.en;
const LOAD_FAILED = en.settings.routerModels.loadFailed;

/** What the chat actually does with it, through the version the app pins. */
const render = (text: string) => marked(text) as string;
const hasLink = (html: string) => /<a[\s>]/i.test(html);

describe('routerFailureText', () => {
  it('says nothing where the operation left no record', () => {
    expect(routerFailureText(undefined, en)).toBeUndefined();
  });

  it('renders the cause alone where the server gave no words', () => {
    expect(routerFailureText({cause: 'load-failed'}, en)).toBe(LOAD_FAILED);
  });

  // The picker row is a plain <Text>, so it needs no escaping and model
  // identifiers reach it as the server wrote them.
  it('leaves the server words unescaped for a surface that renders no markup', () => {
    expect(
      routerFailureText({cause: 'load-failed', message: 'Q4_K_M in C:\\m'}, en),
    ).toBe(`${LOAD_FAILED} “Q4_K_M in C:\\m”`);
  });

  // Split from the markdown path, this one lost both steps that are not about
  // markup: a multi-line body stacked in a one-line row, and a direction
  // control reordered what was read.
  it('still gives that surface one line with nothing invisible in it', () => {
    expect(
      routerFailureText(
        {cause: 'load-failed', message: 'a\n\nb\u202Ec\u200Bd'},
        en,
      ),
    ).toBe(`${LOAD_FAILED} “a bcd”`);
  });

  // The bubble is authored by the assistant, so words run together with the
  // app's own read as the app saying them.
  it('marks the server words as quoted rather than said', () => {
    expect(
      routerFailureText({cause: 'load-failed', message: 'no free slot'}, en),
    ).toContain('“no free slot”');
  });
});

describe('asInertServerText, rendered through the chat markdown', () => {
  // Autolinking needs none of the characters that spell a link, so a strip
  // list aimed at [ and ] leaves a tappable href behind.
  it.each([
    'Contact support at https://evil.example/fix-now',
    'HTTP://EVIL.EXAMPLE/x',
    'ftp://evil.example/x',
    'see www.evil.example for help',
    'mail admin@evil.example now',
  ])('renders no link for %s', text => {
    expect(hasLink(render(text))).toBe(true); // the control: unhandled, it links
    expect(hasLink(render(asInertServerText(text)))).toBe(false);
  });

  // The same control as above: assert the renderer does emit the markup when
  // it is handed the raw text, so this cannot pass by the renderer having
  // gone inert for some unrelated reason.
  it.each([
    '<img src=x onerror=alert(1)>',
    '<a href="http://evil.example">x</a>',
    '<script>alert(1)</script>',
  ])('renders no raw markup for %s', text => {
    const raw = /<(a|img|script|iframe)[\s>]/i;

    expect(render(text)).toMatch(raw);
    expect(render(asInertServerText(text))).not.toMatch(raw);
  });

  it('formats nothing', () => {
    expect(render(asInertServerText('**boom** `rm -rf` ~~gone~~'))).toBe(
      '<p>**boom** `rm -rf` ~~gone~~</p>\n',
    );
  });

  // Stripping these mangled the identifiers users retype into a download
  // field: Q4_K_M became Q4KM and a Windows path lost its separators.
  it('keeps identifiers and paths exactly as the server wrote them', () => {
    const identifiers =
      'Q4_K_M n_ctx C:\\models\\foo.gguf model-7b.Q4_K_M.gguf';

    expect(render(asInertServerText(identifiers))).toBe(
      `<p>${identifiers.replace(/&/g, '&amp;')}</p>\n`,
    );
  });

  // JavaScript's \s matches none of these, so collapsing whitespace leaves
  // them in place to reorder what the user reads.
  it('drops the controls that reorder or hide text', () => {
    expect(asInertServerText('a\u202Eb\u200Bc\u2066d')).toBe('abcd');
  });

  it('collapses a multi-line body onto one line', () => {
    expect(asInertServerText('a\n\nb\tc')).toBe('a b c');
  });
});

describe('capServerText', () => {
  it('bounds a body that would otherwise be the whole turn', () => {
    expect(capServerText('x'.repeat(5000))).toHaveLength(200);
  });

  it('does not cut a surrogate pair in half', () => {
    const capped = capServerText('a'.repeat(199) + '\u{1F600}');

    expect(Array.from(capped)).toHaveLength(200);
    expect(capped.endsWith('\u{1F600}')).toBe(true);
  });
});

describe('routerFailureMarkdownText', () => {
  it('says nothing where the operation left no record', () => {
    expect(routerFailureMarkdownText(undefined, en)).toBeUndefined();
  });

  it('falls back to the cause where nothing survives', () => {
    expect(
      routerFailureMarkdownText({cause: 'load-failed', message: ' '}, en),
    ).toBe(LOAD_FAILED);
  });

  it('has copy for the wait this app stopped itself', () => {
    expect(routerFailureLabel('wait-stopped', en)).toBe(
      en.settings.routerModels.waitStopped,
    );
  });
});
