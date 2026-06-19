import React from 'react';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';

import {HeaderLeft} from '../HeaderLeft';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack}),
}));

describe('HeaderLeft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a back affordance (the drawer hamburger is gone)', () => {
    const {getByTestId, queryByTestId} = render(<HeaderLeft />);
    expect(getByTestId('back-button')).toBeTruthy();
    // The hamburger's menu-button testID is retired with the drawer.
    expect(queryByTestId('menu-button')).toBeNull();
  });

  it('pops the stack on press', () => {
    const {getByTestId} = render(<HeaderLeft />);
    fireEvent.press(getByTestId('back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
