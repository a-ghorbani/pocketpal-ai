import React from 'react';
import {Alert} from 'react-native';
import {render as baseRender, fireEvent} from '../../../../jest/test-utils';
import {AboutScreen} from '../AboutScreen';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

// Mock DeviceInfo
jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn().mockReturnValue('1.0.0'),
  getBuildNumber: jest.fn().mockReturnValue('100'),
}));

// Mock Clipboard
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

jest.spyOn(Alert, 'alert');

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const {getByText} = render(<AboutScreen />);

    expect(getByText('AisodChat')).toBeTruthy();
    expect(getByText('v1.0.0 (100)')).toBeTruthy();
  });

  it('copies version to clipboard when version button is pressed', () => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText('v1.0.0 (100)'));

    expect(Alert.alert).toHaveBeenCalledWith('Copied', 'Version copied to clipboard.');
  });
});
