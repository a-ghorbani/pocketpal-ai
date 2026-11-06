import React from 'react';

import {EnrichedMarkdownText} from 'react-native-enriched-markdown';

import {render} from '../../../jest/test-utils';
import {MarkdownView} from '../../components/MarkdownView';
import {l10n} from '../../locales';
import {routerFailureMessage} from '../routerCopy';

const en = l10n.en;

describe('a router failure message in the chat', () => {
  it("renders the server's words as their own paragraph", () => {
    render(
      <MarkdownView
        markdownText={routerFailureMessage('load-failed', 'out of memory', en)}
        maxMessageWidth={300}
      />,
    );

    const calls = (EnrichedMarkdownText as unknown as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][0].markdown).toBe(
      `${en.settings.routerModels.loadFailed}\n\n“out of memory”`,
    );
  });
});
