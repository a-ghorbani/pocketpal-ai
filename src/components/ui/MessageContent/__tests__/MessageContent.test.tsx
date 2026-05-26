import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {MessageContent} from '../MessageContent';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('MessageContent', () => {
  it('defaults to testID=ui-message-content', () => {
    const {getByTestId} = render(<MessageContent text="hello" />);
    expect(getByTestId('ui-message-content')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'MessageContent',
  ({variant}) => <MessageContent variant={variant} text="hello world" />,
  {
    variants: ['user', 'assistant', 'system'] as const,
    sizes: ['m'] as const,
    states: ['default'] as const,
    langs: ['fa'] as const,
  },
);
