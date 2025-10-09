import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {render} from '../../../../jest/test-utils';
import {AttachmentButton} from '../AttachmentButton';

describe('AttachmentButton', () => {
  describe('User Interaction', () => {
    it('should trigger onPress callback when user taps the button', () => {
      const mockOnPress = jest.fn();
      const {getByTestId} = render(<AttachmentButton onPress={mockOnPress} />);

      fireEvent.press(getByTestId('attachment-button'));

      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple rapid taps correctly', () => {
      const mockOnPress = jest.fn();
      const {getByTestId} = render(<AttachmentButton onPress={mockOnPress} />);

      const button = getByTestId('attachment-button');
      fireEvent.press(button);
      fireEvent.press(button);
      fireEvent.press(button);

      expect(mockOnPress).toHaveBeenCalledTimes(3);
    });

    it('should not crash when tapped without onPress handler', () => {
      const {getByTestId} = render(<AttachmentButton />);

      expect(() =>
        fireEvent.press(getByTestId('attachment-button')),
      ).not.toThrow();
    });
  });

  describe('TouchableOpacity Props Integration', () => {
    it('should call both component onPress and touchableOpacityProps.onPress', () => {
      const componentOnPress = jest.fn();
      const touchableOnPress = jest.fn();

      const {getByTestId} = render(
        <AttachmentButton
          onPress={componentOnPress}
          touchableOpacityProps={{onPress: touchableOnPress}}
        />,
      );

      fireEvent.press(getByTestId('attachment-button'));

      expect(componentOnPress).toHaveBeenCalledTimes(1);
      expect(touchableOnPress).toHaveBeenCalledTimes(1);
    });

    it('should respect disabled state from touchableOpacityProps', () => {
      const mockOnPress = jest.fn();
      const {getByTestId} = render(
        <AttachmentButton
          onPress={mockOnPress}
          touchableOpacityProps={{disabled: true}}
        />,
      );

      const button = getByTestId('attachment-button');
      expect(button.props.accessibilityState.disabled).toBe(true);
    });

    it('should allow custom testID override via touchableOpacityProps', () => {
      const {getByTestId, queryByTestId} = render(
        <AttachmentButton touchableOpacityProps={{testID: 'custom-id'}} />,
      );

      expect(getByTestId('custom-id')).toBeTruthy();
      expect(queryByTestId('attachment-button')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have button role for screen readers', () => {
      const {getByTestId} = render(<AttachmentButton />);

      expect(getByTestId('attachment-button').props.accessibilityRole).toBe(
        'button',
      );
    });

    it('should have descriptive accessibility label', () => {
      const {getByTestId} = render(<AttachmentButton />);

      const label = getByTestId('attachment-button').props.accessibilityLabel;
      expect(label).toBeTruthy();
      expect(typeof label).toBe('string');
    });
  });
});
