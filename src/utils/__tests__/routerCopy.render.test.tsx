import React from 'react';

import {render} from '../../../jest/test-utils';
import {MarkdownView} from '../../components/MarkdownView';
import {l10n} from '../../locales';
import {routerFailureMessage} from '../routerCopy';

const en = l10n.en;

describe('a router failure message in the chat', () => {
  it("renders the server's words as their own paragraph", () => {
    const {getByText} = render(
      <MarkdownView
        markdownText={routerFailureMessage('load-failed', 'out of memory', en)}
        maxMessageWidth={300}
      />,
    );

    expect(getByText(en.settings.routerModels.loadFailed)).toBeTruthy();
    expect(getByText('“out of memory”')).toBeTruthy();
  });
});
