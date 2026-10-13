import React from 'react';
import {TextInput as NativeTextInput} from 'react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';

import {render} from '../../../../jest/test-utils';

import {renderSheetAwareInput} from '../SheetAwareNativeInput';
import {TextInput} from '../TextInput';

const mockUseBottomSheetInternal = useBottomSheetInternal as jest.Mock;

describe('TextInput sheet registration', () => {
  afterEach(() => {
    mockUseBottomSheetInternal.mockImplementation(() => null);
  });

  it('renders a BottomSheetTextInput inside a sheet context', () => {
    mockUseBottomSheetInternal.mockImplementation(() => ({}));

    const {UNSAFE_getByType} = render(<TextInput testID="x" />);

    expect(UNSAFE_getByType(BottomSheetTextInput).props.testID).toBe('x');
  });

  it('renders a plain native input outside a sheet context', () => {
    const {UNSAFE_queryByType, getByTestId} = render(<TextInput testID="x" />);

    expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
    expect(getByTestId('x').type).toBe('TextInput');
  });

  it.each([
    ['inside', () => ({})],
    ['outside', () => null],
  ])('forwards the ref to the native field %s a sheet', (_, context) => {
    mockUseBottomSheetInternal.mockImplementation(context);
    const ref = jest.fn();

    render(<>{renderSheetAwareInput({ref, style: {}, testID: 'x'})}</>);

    expect(ref).toHaveBeenCalledWith(
      expect.objectContaining({focus: expect.any(Function)}),
    );
  });

  it('lets a caller-supplied render win', () => {
    mockUseBottomSheetInternal.mockImplementation(() => ({}));

    const {UNSAFE_queryByType, getByTestId} = render(
      <TextInput
        testID="x"
        render={props => <NativeTextInput {...props} testID="custom" />}
      />,
    );

    expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
    expect(getByTestId('custom')).toBeTruthy();
  });
});
