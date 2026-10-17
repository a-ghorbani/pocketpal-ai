import React from 'react';

import {EnrichedMarkdownText} from 'react-native-enriched-markdown';

import {render} from '../../../../jest/test-utils';

import {ReasoningBlock} from '../ReasoningBlock';

const spy = EnrichedMarkdownText as unknown as jest.Mock;

describe('ReasoningBlock', () => {
  beforeEach(() => {
    spy.mockClear();
  });

  it('renders reasoning through the shared markdown view, not selectable', () => {
    const {getByText} = render(
      <ReasoningBlock text="Plan: **x**" maxWidth={300} />,
    );

    expect(getByText('Plan: **x**')).toBeTruthy();
    expect(spy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        markdown: 'Plan: **x**',
        flavor: 'github',
        selectable: false,
        streamingAnimation: undefined,
      }),
    );
    expect(spy.mock.calls[0][0].markdownStyle.paragraph.fontSize).toBe(14);
  });

  it.each(['', '  \n'])('renders nothing for empty reasoning %j', text => {
    const {queryByTestId} = render(
      <ReasoningBlock text={text} maxWidth={300} />,
    );

    expect(queryByTestId('markdown-content')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
