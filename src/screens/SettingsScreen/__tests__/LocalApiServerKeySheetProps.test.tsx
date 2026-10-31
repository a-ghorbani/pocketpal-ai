import React from 'react';

import {render, fireEvent} from '../../../../jest/test-utils';

import {LocalApiServerCard} from '../LocalApiServerCard';

const sheetProps: any[] = [];

jest.mock('../../../components/Sheet/Sheet', () => {
  const {View} = require('react-native');
  const MockSheet = (props: any) => {
    sheetProps.push(props);
    return props.isVisible ? <View>{props.children}</View> : null;
  };
  MockSheet.ScrollView = ({children}: any) => <View>{children}</View>;
  MockSheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet: MockSheet};
});

describe('LocalApiServerCard key sheet', () => {
  it('opens at a snap point the sheet defines', () => {
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent.press(getByTestId('local-api-server-key-button'));
    const last = sheetProps[sheetProps.length - 1];
    expect(last.isVisible).toBe(true);
    const snapCount = (last.snapPoints ?? []).length;
    const index = last.index ?? 0;
    expect(index).toBeLessThan(Math.max(snapCount, 1));
  });
});
