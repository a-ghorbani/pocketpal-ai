import React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../../jest/test-utils';
import {themeFixtures} from '../../../../../jest/fixtures/theme';
import {Dialog} from '../Dialog';
import {createStyles} from '../styles';

const fillsParent = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

describe('Dialog', () => {
  it('renders a single ui-header when visible', () => {
    const {getAllByTestId} = render(
      <Dialog isVisible title="Confirm">
        <Text>body</Text>
      </Dialog>,
    );
    const headers = getAllByTestId('ui-header');
    expect(headers).toHaveLength(1);
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <Dialog title="Confirm">
        <Text>body</Text>
      </Dialog>,
    );
    expect(queryByTestId('ui-dialog')).toBeNull();
  });

  it('spans the screen with the scrim and the centring wrapper', () => {
    const styles = createStyles(themeFixtures.lightTheme);
    expect(styles.scrim).toMatchObject(fillsParent);
    expect(styles.centerWrapper).toMatchObject(fillsParent);
  });
});
